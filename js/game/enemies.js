// enemies.js — standalone IIFE. Enemy spawning, AI, boss logic.
(() => {

  function findSafeEnemySpawnPoint(preferredX, preferredY, radius = 18) {
    const isSpawnUsable = (x, y) => !isBlocked(x, y, radius) && hasNavigableSpawnSpace(x, y, radius, Neo.player);
    if (isSpawnUsable(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }
    
    const searchAngles = 16;
    const maxAttempts = 40;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = (attempt / searchAngles) * Math.PI * 2;
      const searchRadius = 30 + (attempt % 4) * 40;
      const x = clamp(preferredX + Math.cos(angle) * searchRadius, Neo.WALL + radius, Neo.ROOM_W - Neo.WALL - radius);
      const y = clamp(preferredY + Math.sin(angle) * searchRadius, Neo.WALL + radius, Neo.ROOM_H - Neo.WALL - radius);
      if (isSpawnUsable(x, y)) {
        return { x, y };
      }
    }
    
    return null;
  }

  function compactEnemyList() {
    if (!Array.isArray(Neo.enemies) || Neo.enemies.length === 0) return;
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
    if (Neo.enemies.length !== before) syncCurrentRoomState();
  }

  function getCoverObstacles() {
    const obstacleRects = Neo.structures.map(structure => ({
      x: structure.x - structure.w / 2,
      y: structure.y - structure.h / 2,
      w: structure.w,
      h: structure.h,
    }));
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (prop.kind !== 'wall' && prop.kind !== 'secret_wall' && prop.kind !== 'cover_wall') return;
      obstacleRects.push(getDestructibleRect(prop));
    });
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
        const targetX = clamp(cx + nx * sample.depth + px * sample.side, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r);
        const targetY = clamp(cy + ny * sample.depth + py * sample.side, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r);
        if (isBlocked(targetX, targetY, enemy.r)) return;
        if (!lineIntersectsRect(Neo.player.x, Neo.player.y, targetX, targetY, rect, 6)) return;
        const enemyDistance = dist(enemy.x, enemy.y, targetX, targetY);
        const playerDistance = dist(Neo.player.x, Neo.player.y, targetX, targetY);
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
      || dist(enemy.x, enemy.y, coverTarget.x, coverTarget.y) < 18
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
    const targetDistance = target ? dist(x, y, target.x, target.y) : 0;

    for (let index = 0; index < directions; index += 1) {
      const angle = (index / directions) * Math.PI * 2;
      const px = x + Math.cos(angle) * probeStep;
      const py = y + Math.sin(angle) * probeStep;
      if (isBlocked(px, py, radius)) continue;
      openPaths += 1;
      if (target && dist(px, py, target.x, target.y) < targetDistance - 2) {
        hasProgressTowardTarget = true;
      }
    }

    return openPaths >= 2 && hasProgressTowardTarget;
  }

  function findBlockingBreakableDestructible(x, y, r) {
    const breakableKinds = new Set(['cover_wall', 'wall', 'secret_wall']);
    return Neo.destructibles.find(prop => {
      if (!prop || prop.broken || prop.hidden) return false;
      if (!breakableKinds.has(prop.kind)) return false;
      return destructibleIntersectsCircle(prop, x, y, r);
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
    damageDestructible(blocker, baseDamage + heavyBonus);
    enemy.obstacleHitCd = heavyBonus ? 0.22 : 0.38;
  }

  function getMiniBossSpawnChance(roomType = 'combat') {
    if (Neo.floor < 5) return 0;
    const difficulty = getDifficultyDef();
    const baseChance = clamp(0.08 + (Neo.floor - 5) * 0.02, 0.08, 0.34);
    const scaledChance = baseChance * difficulty.miniBossChanceMultiplier;
    if (roomType === 'ladder') return Math.min(0.95, scaledChance * 3);
    return Math.min(0.8, scaledChance);
  }

  function getWaveCount(baseOffset) {
    const difficulty = getDifficultyDef();
    const challengeBonus = isChallengeActive('swarm_rooms') ? 2 : 0;
    return baseOffset + Neo.floor + difficulty.waveBonus + challengeBonus + irand(0, 1, 'encounter');
  }

  function rollEnemyType() {
    const bonus = getDifficultyDef().roomWeightBonus;
    const roll = Neo.nextRandom('encounter');
    if (Neo.floor >= 7 && roll > 0.9 - bonus * 0.92) return 'machine_gunner';
    if (roll > 0.84 - bonus * 0.9) return 'golem';
    if (roll > 0.68 - bonus * 0.82) return 'sniper';
    if (roll > 0.5 - bonus * 0.68) return 'knave';
    if (roll > 0.32 - bonus * 0.54) return 'cult_mage';
    if (roll > 0.16 - bonus * 0.4) return 'charger';
    if (roll > 0.08 - bonus * 0.24) return 'laser';
    return 'hunter';
  }

  function getFloorBossType() {
    const bossPool = ['queen_cult', 'bulk_golem', 'artificer_knave'];
    const bossRandom = createScopedRandom('floor-boss:type');
    return bossPool[Math.floor(bossRandom() * bossPool.length)] || bossPool[0];
  }

  function rollChallengeTrialType() {
    const pool = Neo.CHALLENGE_TRIAL_TYPES.slice();
    if (Neo.floor <= 2) return pool[irand(0, 2, 'world')];
    if (Neo.floor <= 4) return pool[irand(0, 4, 'world')];
    return pool[irand(0, pool.length - 1, 'world')];
  }

  function getChallengeTrialLabel(type) {
    if (type === 'mirror') return 'MIRROR';
    if (type === 'stillness') return 'STILL';
    if (type === 'bomb') return 'BOMB';
    if (type === 'survival') return 'SURVIVE';
    if (type === 'runes') return 'RUNES';
    if (type === 'storm') return 'STORM';
    return 'TRIAL';
  }

  function buildWavePlan(count, roomType = 'combat') {
    if (Neo.floor < 4) {
      return Array.from({ length: count }, () => rollEnemyType());
    }

    const squads = [
      ['hunter', 'hunter', 'charger'],
      ['hunter', 'laser', 'shield_unit'],
      ['golem', 'healer', 'hunter'],
      ['knave', 'charger', 'healer'],
      ['sniper', 'shield_unit', 'hunter'],
      ['cult_mage', 'summoner', 'hunter'],
    ];
    if (Neo.floor >= 7) {
      squads.push(
        ['machine_gunner', 'shield_unit', 'hunter'],
        ['machine_gunner', 'healer', 'charger'],
        ['sniper', 'machine_gunner', 'hunter'],
      );
    }
    const plan = [];
    let safety = 0;
    while (plan.length < count && safety < 12) {
      safety += 1;
      const squad = squads[irand(0, squads.length - 1, 'encounter')];
      squad.forEach(type => {
        if (plan.length < count) plan.push(type);
      });
    }

    if (roomType === 'ladder' && !plan.includes('shield_unit') && count >= 3) {
      plan[Math.max(1, count - 2)] = 'shield_unit';
    }

    if (count >= 5 && !plan.includes('healer')) {
      plan[count - 2] = 'healer';
    }

    if (count >= 6 && !plan.includes('summoner') && Neo.nextRandom('encounter') < 0.55) {
      plan[count - 3] = 'summoner';
    }

    if (count >= 6 && roomType === 'combat' && Neo.floor >= 4 && Neo.nextRandom('encounter') < 0.22) {
      plan[count - 1] = 'boss_spawner';
    }

    return plan.slice(0, count);
  }

  function spawnMiniBoss(roomType = 'combat') {
    const chance = getMiniBossSpawnChance(roomType);
    const miniBossRandom = createRoomRandom(Neo.currentRoom, `mini-boss:${roomType}`);
    if (chance <= 0 || miniBossRandom() > chance) return;

    const pool = roomType === 'ladder'
      ? ['golem', 'knave', 'cult_mage', 'sniper']
      : ['knave', 'cult_mage', 'sniper', 'golem'];
    const type = pool[Math.floor(miniBossRandom() * pool.length)] || pool[0];
    const angle = miniBossRandom() * Math.PI * 2;
    const radius = 120 + miniBossRandom() * 180;
    const x = clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 80, Neo.ROOM_W - 80);
    const y = clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 80, Neo.ROOM_H - 80);
    const safeSpawn = findSafeEnemySpawnPoint(x, y, 18);
    if (!safeSpawn) return;

    const miniBoss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, canSpawnEliteEnemies());
    miniBoss.hp = Math.round(miniBoss.hp * 1.9);
    miniBoss.speed *= 0.94;
    miniBoss.r = Math.round(miniBoss.r * 1.08);
    miniBoss.miniBoss = true;
    Neo.particles.push({ x: miniBoss.x, y: miniBoss.y - 26, life: 0.7, text: 'MINI BOSS', c: '#ffb347' });
  }

  function spawnWave(count, roomType = 'combat') {
    const plan = buildWavePlan(count, roomType);
    for (let index = 0; index < plan.length; index += 1) {
      const type = plan[index] || rollEnemyType();
      const eliteChance = getDifficultyDef().eliteChance + (isChallengeActive('elite_hunt') ? 0.18 : 0);
      const eliteRoll = canSpawnEliteEnemies() && Neo.nextRandom('encounter') < Math.min(0.85, eliteChance);
      const angle = Neo.nextRandom('encounter') * Math.PI * 2;
      const radius = 140 + Neo.nextRandom('encounter') * 170;
      const preferredX = clamp(Neo.ROOM_W / 2 + Math.cos(angle) * radius, 90, Neo.ROOM_W - 90);
      const preferredY = clamp(Neo.ROOM_H / 2 + Math.sin(angle) * radius, 90, Neo.ROOM_H - 90);
      const safeSpawn = findSafeEnemySpawnPoint(preferredX, preferredY, 15)
        || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 15);
      if (!safeSpawn) continue;
      spawnEnemy(type, safeSpawn.x, safeSpawn.y, eliteRoll);
    }
    spawnMiniBoss(roomType);
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

  function getEnemyDifficultyMultiplier() {
    const gameMinutes = Neo.gameElapsedTime / 60;
    return 1 + gameMinutes * Neo.floor * 0.15;
  }

  function canSpawnEliteEnemies() {
    return Neo.floor >= getDifficultyDef().eliteFloor && Neo.floor <= 10;
  }

  function rollEliteInventory() {
    const inventory = {};
    const pool = Neo.ELITE_INVENTORY_POOL.slice();
    shuffle(pool, 'encounter');
    const slots = irand(1, 3, 'encounter');
    for (let index = 0; index < slots; index += 1) {
      const key = pool[index];
      if (!key) continue;
      inventory[key] = 1 + (Neo.nextRandom('encounter') < 0.28 ? 1 : 0);
    }
    return inventory;
  }

  function rollBlessedEliteInventory() {
    const inventory = {};
    const rolls = irand(10, 15, 'encounter');
    for (let index = 0; index < rolls; index += 1) {
      const key = Neo.WHITE_ITEM_POOL[irand(0, Neo.WHITE_ITEM_POOL.length - 1, 'encounter')];
      if (key) inventory[key] = Number(inventory[key] || 0) + 1;
    }
    return inventory;
  }

  function rollEliteTypes() {
    const pool = ['burning', 'bleeding', 'giant', 'blessed', 'lasered'];
    const shuffled = shuffle(pool, 'encounter');
    const count = Neo.nextRandom('encounter') < 0.18 ? 3 : Neo.nextRandom('encounter') < 0.58 ? 2 : 1;
    return shuffled.slice(0, count);
  }

  function applyEliteInventory(enemy, inventoryOverride = null) {
    const inventory = inventoryOverride || rollEliteInventory();
    enemy.eliteInventory = inventory;

    const stacks = key => Number(inventory[key] || 0);
    const hpMult = 1 + stacks('insurance') * 0.16 + stacks('turtle_shell') * 0.1 + stacks('iron_lung') * 0.24;
    const dmgMult = 1 + stacks('neo_knife') * 0.08 + stacks('orb_of_blood') * 0.14 + stacks('crit_charm') * 0.12 + stacks('oracles_lens') * 0.2;
    const speedMult = 1 + stacks('attack_servo') * 0.08 + stacks('turtle_shell') * 0.04;
    const attackCdMult = Math.max(0.52, 1 - stacks('charged_adapter') * 0.1);
    const stunResistStacks = stacks('anchor_charm');

    enemy.hp = Math.round(enemy.hp * hpMult);
    enemy.max = enemy.hp;
    enemy.dmg = Math.round(enemy.dmg * dmgMult);
    enemy.speed *= speedMult;
    enemy.attackCd *= attackCdMult;
    enemy.r = Math.round(enemy.r * (1 + stacks('iron_lung') * 0.04));
    enemy.stunResistance = Math.max(Number(enemy.stunResistance || 0), stunResistStacks);
  }

  function applyEliteTypes(enemy) {
    if (!enemy?.elite) return;
    enemy.eliteTypes = Array.isArray(enemy.eliteTypes) && enemy.eliteTypes.length ? enemy.eliteTypes : rollEliteTypes();

    if (enemy.eliteTypes.includes('blessed')) {
      applyEliteInventory(enemy, rollBlessedEliteInventory());
    } else {
      applyEliteInventory(enemy);
    }

    if (enemy.eliteTypes.includes('giant')) {
      enemy.max = Math.round(enemy.max * 5);
      enemy.hp = enemy.max;
      enemy.r = Math.round(enemy.r * 1.65);
      enemy.speed *= 0.84;
      enemy.dmg = Math.round(enemy.dmg * 1.18);
    }

    if (enemy.eliteTypes.includes('burning')) {
      enemy.fireImmune = true;
      enemy.burningTick = rand(0.9, 0.25, 'encounter');
    }
    if (enemy.eliteTypes.includes('bleeding')) {
      enemy.bleedImmune = true;
      enemy.bleedingTick = rand(1.1, 0.35, 'encounter');
    }
    if (enemy.eliteTypes.includes('lasered')) {
      enemy.eliteLaserCd = rand(1.9, 0.8, 'encounter');
      enemy.eliteLaserModeIndex = 0;
    }
  }

  function scaleEnemyStats(baseStats, type) {
    const result = { ...baseStats };
    const sandbox = getActiveSandboxSettings();
    const difficulty = getDifficultyDef();
    const gameMinutes = Neo.gameElapsedTime / 60;
    const loopNumber = Math.max(1, Math.floor((Neo.floor - 1) / 10) + 1);
    const floorInLoop = ((Neo.floor - 1) % 10) + 1;
    const floorMultiplier = 1 + (floorInLoop - 1) * Neo.ENEMY_SCALING.floor;
    const loopMultiplier = 1 + (loopNumber - 1) * Neo.ENEMY_SCALING.loop;
    const timerMultiplier = 1 + gameMinutes * Neo.ENEMY_SCALING.minute;
    const difficultyMultiplier = isBossType(type) ? difficulty.bossStatMultiplier : difficulty.statMultiplier;
    const combinedScaleFactor = floorMultiplier * loopMultiplier * timerMultiplier * difficultyMultiplier;
    result.hp = Math.round(result.hp * combinedScaleFactor);
    result.max = result.hp;
    result.dmg = Math.round(result.dmg * combinedScaleFactor);
    result.speed *= combinedScaleFactor * difficulty.speedMultiplier;
    if (sandbox) {
      result.hp = Math.max(1, Math.round(result.hp * sandbox.enemyStatMultiplier));
      result.max = result.hp;
      result.dmg = Math.max(1, Math.round(result.dmg * sandbox.enemyStatMultiplier));
      result.speed *= sandbox.enemySpeedMultiplier;
    }
    return result;
  }

  function spawnEnemy(type, x, y, elite = false) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox && !sandbox.allowedEnemies.includes(type)) {
      type = sandbox.allowedEnemies[0] || 'hunter';
    }
    const eliteAllowed = !!elite && canSpawnEliteEnemies();
    const base = {
      type,
      x,
      y,
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
      attackCd: rand(0.2, 0.9, 'encounter'),
      statuses: createStatusMap(),
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
      spawnT: 0.72,
    };
    const roomPart = Neo.currentRoom
      ? `room:${Neo.currentRoom.gx},${Neo.currentRoom.gy}|type:${Neo.currentRoom.type || 'room'}`
      : 'room:none';
    if (Neo.currentRoom) Neo.currentRoom.enemySpawnSerial = Math.max(0, Number(Neo.currentRoom.enemySpawnSerial || 0)) + 1;
    base.lootSeed = `${getFloorSeed()}|${roomPart}|enemy:${type}:${Math.round(x)},${Math.round(y)}:${Neo.currentRoom?.enemySpawnSerial || 0}|loot`;

    if (type === 'god') {
      base.r = 34;
      base.hp = 920;
      base.max = 920;
      base.speed = 108;
      base.dmg = 18;
      base.attackCd = 1.4;
      base.beamRange = 620;
      base.sweepDir = 1;
      base.sweepSpeed = 0;
      base.phase = 1;
      base.rebirthUsed = false;
      base.phase3Triggered = false;
      base.phase4Triggered = false;
      base.phase5Triggered = false;
      base.novaCd = 2.4;
      base.judgementCd = 4.2;
    } else if (type === 'cult_mage') {
      base.r = 17;
      base.hp = 84;
      base.max = 84;
      base.speed = 58;
      base.dmg = 18;
      base.attackCd = 1.8;
    } else if (type === 'knave') {
      base.r = 16;
      base.hp = 68;
      base.max = 68;
      base.speed = 118;
      base.dmg = 14;
      base.attackCd = 1.3;
    } else if (type === 'sniper') {
      base.r = 15;
      base.hp = 58;
      base.max = 58;
      base.speed = 104;
      base.dmg = 12;
      base.attackCd = 1.55;
    } else if (type === 'machine_gunner') {
      base.r = 17;
      base.hp = 96;
      base.max = 96;
      base.speed = 112;
      base.dmg = 8;
      base.attackCd = 1.15;
      base.burstShots = 0;
      base.burstDelay = 0;
      base.burstAngle = 0;
    } else if (type === 'golem') {
      base.r = 20;
      base.hp = 132;
      base.max = 132;
      base.speed = 70;
      base.dmg = 18;
      base.attackCd = 1.9;
      base.bleedImmune = true;
    } else if (type === 'cult_follower') {
      base.r = 12;
      base.hp = 34;
      base.max = 34;
      base.speed = 138;
      base.dmg = 8;
      base.attackCd = 0.85;
    } else if (type === 'summoner') {
      base.r = 18;
      base.hp = 120;
      base.max = 120;
      base.speed = 66;
      base.dmg = 12;
      base.attackCd = 1.5;
      base.summonCd = 4.4;
    } else if (type === 'shield_unit') {
      base.r = 22;
      base.hp = 210;
      base.max = 210;
      base.speed = 52;
      base.dmg = 10;
      base.attackCd = 1.4;
      base.bleedImmune = true;
      base.supportCd = 2.8;
    } else if (type === 'healer') {
      base.r = 19;
      base.hp = Neo.floor >= 4 ? 260 : 150;
      base.max = base.hp;
      base.speed = 64;
      base.dmg = 10;
      base.attackCd = 1.2;
      base.supportCd = Neo.floor >= 4 ? 2.2 : 3;
    } else if (type === 'boss_spawner') {
      base.r = 24;
      base.hp = 300;
      base.max = 300;
      base.speed = 42;
      base.dmg = 8;
      base.attackCd = 1.8;
      base.bleedImmune = true;
      base.bossSpawnTimer = 30;
      base.bossSpawnWarnAt = 30;
    } else if (type === 'queen_cult') {
      base.r = 38;
      base.hp = 760;
      base.max = 760;
      base.speed = 96;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.summonCd = 2.4;
    } else if (type === 'bulk_golem') {
      base.r = 58;
      base.hp = 1280;
      base.max = 1280;
      base.speed = 88;
      base.dmg = 31;
      base.attackCd = 1.6;
      base.bleedImmune = true;
      base.splitReady = true;
      base.aoeTime = 3;
      base.jumpCd = 1.2;
    } else if (type === 'artificer_knave') {
      base.r = 30;
      base.hp = 1880;
      base.max = 1880;
      base.speed = 124;
      base.dmg = 20;
      base.attackCd = 1.2;
      base.phase = 1;
    } else {
      if (eliteAllowed) {
        base.hp = Math.round(base.hp * 1.35);
        base.max = base.hp;
        base.speed *= 1.08;
        base.r = 17;
      }
    }

    const scaled = scaleEnemyStats(base, type);
    base.hp = scaled.hp;
    base.max = scaled.max;
    base.dmg = scaled.dmg;
    base.speed = scaled.speed;

    const difficultyTuning = getEnemyDifficultyTuning();
    if (!isBossType(type) && Neo.floor >= 4) {
      const barrierChance = type === 'shield_unit'
        ? 1
        : (type === 'healer' || type === 'summoner' || type === 'laser' || type === 'sniper' || type === 'machine_gunner')
          ? 0.12 * difficultyTuning.supportPower
          : 0.05 * Math.max(1, difficultyTuning.supportPower - 0.02);
      if (Neo.nextRandom('encounter') < barrierChance) {
        base.barrier = Math.round(base.max * (type === 'shield_unit' ? 0.24 : 0.12 * difficultyTuning.supportPower));
      }
    }

    if (isBossType(type)) {
      base.hp = Math.round(base.hp * 2);
      base.max = base.hp;
    }

    if (type === 'god') {
      base.hp = Math.round(base.hp * 5);
      base.max = base.hp;
      base.dmg = Math.round(base.dmg * 5);
      base.speed *= 1.12;
    }

    if (base.elite) applyEliteTypes(base);

    Neo.enemies.push(base);
    return base;
  }

  function spawnGodBoss() {
    const existing = Neo.enemies.find(enemy => enemy.type === 'god');
    if (existing) return existing;
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 40, 15);
    if (!safeSpawn) return null;
    return spawnEnemy('god', safeSpawn.x, safeSpawn.y, false);
  }

  function playGodDialogue(phase) {
    const line = Neo.GOD_PHASE_DIALOGUE[phase];
    if (!line) return false;
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    clearGameplayInput();
    return Neo.uiController.playDialogue([{ speaker: 'GOD', text: line }], { returnState: 'play' });
  }

  function tryPlayKnaveKnightCutscene(enemy, enemyType) {
    if (!enemy || enemyType !== 'artificer_knave' || !Neo.player) return false;
    if (Neo.player.character !== 'thorn_knight') return false;
    if (Neo.knaveKnightCutscenePlayed) return false;

    Neo.knaveKnightCutscenePlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    scheduleRunSave();

    return Neo.uiController.playDialogue([
      { speaker: 'KNAVE', text: 'You think you can out fight me you couldnt out argue me! your logic is false' },
      { speaker: 'KNIGHT', text: 'The kingdom of God has come for you ...' },
      { speaker: 'KNAVE', text: 'Violence it is' },
    ], { returnState: 'play' });
  }

  function tryPlayQueenMetaoCutscene(enemy, enemyType) {
    if (!enemy || enemyType !== 'queen_cult' || !Neo.player) return false;
    if (Neo.player.character !== 'metao') return false;
    if (Neo.queenMetaoCutscenePlayed) return false;

    Neo.queenMetaoCutscenePlayed = true;
    clearGameplayInput();
    setShopPanelOpen(false);
    setInventoryPanelOpen(false);
    enemy.attackCd = Math.max(Number(enemy.attackCd || 0), 1.4);
    enemy.stun = Math.max(Number(enemy.stun || 0), 0.25);
    scheduleRunSave();

    return Neo.uiController.playDialogue([
      { speaker: 'QUEEN', text: 'once my champion planning to kill me again are you apostate' },
      { speaker: 'MATEO', text: '...' },
      { speaker: 'QUEEN', text: 'Your life will be mine !' },
    ], { returnState: 'play' });
  }

  function tryPlayBossIntroCutscene(enemy, enemyType) {
    return tryPlayKnaveKnightCutscene(enemy, enemyType)
      || tryPlayQueenMetaoCutscene(enemy, enemyType);
  }

  function sayOverEntity(entity, text, options = {}) {
    if (!entity || !text) return null;
    return Neo.uiController.sayAtWorldAnchor({
      anchor: () => Neo.enemies.includes(entity) ? { x: entity.x, y: entity.y } : null,
      speaker: options.speaker || getBossLabel(entity.type),
      text,
      offsetY: options.offsetY ?? (entity.r ? entity.r + 26 : 56),
      tone: options.tone || 'boss',
      typeSpeed: options.typeSpeed,
      holdTime: options.holdTime,
    });
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

  function getMirrorChampionStats() {
    const attackSpeed = getAttackSpeedValue();
    const itemStats = getItemStats();
    const equippedMoves = { ...(Neo.player?.equippedMoves || getDefaultMovesForCharacter(Neo.player?.character || Neo.chosenCharacter)) };
    const meleeMove = equippedMoves.melee || 'slash';
    const laserMove = equippedMoves.laser || 'blood_beam';
    const smashMove = equippedMoves.smash || 'crimson_smash';
    const dashMove = equippedMoves.dash || 'dash';
    const mirrorCooldownMultiplier = 0.82;
    const weaponKey = Neo.player?.equippedWeapon || '';
    const weaponStats = weaponKey ? {
      damage: Math.max(1, Math.round((Neo.WEAPON_BASE_STATS[weaponKey]?.damage ?? getPlayerBaseDamage()) + getAnvilWeaponBonus(weaponKey, 'damage'))),
      range: Math.max(40, Math.round((Neo.WEAPON_BASE_STATS[weaponKey]?.range ?? Neo.ATTACKS.melee.range) + getAnvilWeaponBonus(weaponKey, 'range'))),
      knockback: Math.max(0, Math.round((Neo.WEAPON_BASE_STATS[weaponKey]?.knockback ?? Neo.ATTACKS.melee.push) + getAnvilWeaponBonus(weaponKey, 'knockback'))),
      cooldown: Math.max(0.12, getWeaponBaseCooldown(weaponKey) * mirrorCooldownMultiplier),
    } : null;
    const meleeDamage = weaponStats
      ? weaponStats.damage
      : Math.round((Neo.MOVE_BASE_STATS[meleeMove]?.damage ?? getPlayerBaseDamage()) + getAnvilMoveBonus(meleeMove, 'damage') + (Neo.player?.attackPower || 0) * 0.35);
    const beamDamage = Math.round((Neo.MOVE_BASE_STATS[laserMove]?.damage ?? Neo.ATTACKS.laser.damage) + getAnvilMoveBonus(laserMove, 'damage') + (Neo.player?.attackPower || 0) * 0.45);
    const smashDamage = Math.round((Neo.MOVE_BASE_STATS[smashMove]?.damage ?? Neo.ATTACKS.smash.damage) + getAnvilMoveBonus(smashMove, 'damage') + (Neo.player?.attackPower || 0) * 0.9);
    const moveSpeed = Math.round(228 * (itemStats.moveSpeedMultiplier || 1));
    return {
      hp: Math.max(90, Math.round(Neo.player.maxHp)),
      dmg: Math.max(18, meleeDamage),
      beamDamage: Math.max(10, beamDamage),
      smashDamage: Math.max(20, smashDamage),
      speed: Math.max(108, moveSpeed),
      attackCd: Math.max(0.22, 0.56 / attackSpeed),
      attackSpeed,
      equippedMoves,
      equippedWeapon: weaponKey,
      weaponStats,
      mirrorCooldowns: {
        melee: weaponStats ? weaponStats.cooldown : Math.max(0.18, getMeleeCooldownDuration(meleeMove, attackSpeed) * mirrorCooldownMultiplier),
        laser: Math.max(0.75, getLaserCooldownDuration(laserMove, attackSpeed) * mirrorCooldownMultiplier),
        smash: Math.max(1.1, getSmashCooldownDuration(attackSpeed) * mirrorCooldownMultiplier),
        dash: Math.max(0.55, getDashCooldownDuration(dashMove, attackSpeed) * mirrorCooldownMultiplier),
      },
      spriteKey: Neo.player.character,
    };
  }

  function spawnMirrorChampion() {
    const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2 - 150, 18);
    if (!safeSpawn) return null;
    const stats = getMirrorChampionStats();
    const mirror = {
      type: 'mirror_knight',
      x: safeSpawn.x,
      y: safeSpawn.y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: stats.hp,
      max: stats.hp,
      speed: stats.speed,
      dmg: stats.dmg,
      beamDamage: stats.beamDamage,
      smashDamage: stats.smashDamage,
      elite: false,
      stun: 0,
      inv: 0,
      attackCd: stats.attackCd,
      statuses: createStatusMap(),
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
      spriteKey: stats.spriteKey,
      mirrorMoves: stats.equippedMoves,
      mirrorWeapon: stats.equippedWeapon,
      mirrorWeaponStats: stats.weaponStats,
      mirrorCooldowns: stats.mirrorCooldowns,
      mirrorLaserCd: Math.max(0.55, stats.mirrorCooldowns.laser * 0.45),
      mirrorSmashCd: Math.max(0.8, stats.mirrorCooldowns.smash * 0.55),
      mirrorDashCd: Math.max(0.45, stats.mirrorCooldowns.dash * 0.4),
    };
    Neo.enemies.push(mirror);
    Neo.particles.push({ x: mirror.x, y: mirror.y - 28, life: 1, text: 'MIRROR CHAMPION', c: '#d7f6ff' });
    sayOverEntity(mirror, 'I know every move you make.', { speaker: 'MIRROR', tone: 'mirror', holdTime: 1.9 });
    return mirror;
  }

  function spawnChallengeStarter(room) {
    if (!room || room.type !== 'challenge') return;
    const existing = Neo.pickups.find(pickup => pickup?.type === 'challengeStarter');
    if (existing) return;
    Neo.pickups.push({
      x: Neo.ROOM_W / 2,
      y: Neo.ROOM_H / 2,
      type: 'challengeStarter',
      trial: room.challengeType || 'mirror',
    });
  }

  function spawnChallengeBombs(room) {
    const slots = [
      [-90, -90], [0, -90], [90, -90],
      [-90, 0], [0, 0], [90, 0],
      [-90, 90], [0, 90], [90, 90],
    ];
    const safeIndex = irand(0, slots.length - 1, 'loot');
    room.challengeData = { safeBombIndex: safeIndex };
    slots.forEach(([ox, oy], index) => {
      Neo.pickups.push({
        x: Neo.ROOM_W / 2 + ox,
        y: Neo.ROOM_H / 2 + oy,
        type: 'challengeBomb',
        safe: index === safeIndex,
      });
    });
  }

  function spawnChallengeRunes(room) {
    const count = 5;
    room.challengeData = { runesLeft: count };
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.nextRandom('world') * 0.18;
      const driftAngle = angle + Math.PI / 2 + rand(-0.55, 0.55, 'world');
      const driftSpeed = rand(82, 56, 'world');
      Neo.pickups.push({
        x: Neo.ROOM_W / 2 + Math.cos(angle) * 160,
        y: Neo.ROOM_H / 2 + Math.sin(angle) * 160,
        type: 'challengeRune',
        vx: Math.cos(driftAngle) * driftSpeed,
        vy: Math.sin(driftAngle) * driftSpeed,
      });
    }
  }

  function spawnTrialEnemyWave(count = 1) {
    const pool = Neo.floor >= 6
      ? ['hunter', 'laser', 'charger', 'knave']
      : ['hunter', 'laser', 'charger'];
    for (let index = 0; index < count; index += 1) {
      const angle = Neo.nextRandom('encounter') * Math.PI * 2;
      const radius = 170 + Neo.nextRandom('encounter') * 90;
      const safeSpawn = findSafeEnemySpawnPoint(Neo.ROOM_W / 2 + Math.cos(angle) * radius, Neo.ROOM_H / 2 + Math.sin(angle) * radius, 15);
      if (!safeSpawn) continue;
      const type = pool[irand(0, pool.length - 1, 'encounter')];
      spawnEnemy(type, safeSpawn.x, safeSpawn.y, false);
    }
  }

  function beginChallengeTrial(room) {
    if (!room || room.type !== 'challenge' || room.challengeStarted) return;
    room.challengeStarted = true;
    room.challengeTick = 0;
    room.challengeData = {};
    room.challengeFailed = false;
    Neo.pickups = Neo.pickups.filter(pickup => pickup?.type !== 'challengeStarter');
    const type = room.challengeType || 'mirror';
    if (type === 'mirror') {
      spawnMirrorChampion();
    } else if (type === 'stillness') {
      room.challengeTimer = scaleChallengeTimer(10);
      room.challengeData.maxTimer = room.challengeTimer;
      room.challengeData.anchorX = Neo.player.x;
      room.challengeData.anchorY = Neo.player.y;
      room.challengeData.graceTimer = 2;
      room.challengeData.warnTick = 0;
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Stand still or lose everything.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'bomb') {
      spawnChallengeBombs(room);
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Choose wrong and you get nothing.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'survival') {
      room.challengeTimer = scaleChallengeTimer(20);
      room.challengeTick = 0.9;
      spawnTrialEnemyWave(2);
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Live through it.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'runes') {
      spawnChallengeRunes(room);
      room.challengeTimer = scaleChallengeTimer(30);
      room.challengeData.maxTimer = room.challengeTimer;
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Claim every rune.', { speaker: 'TRIAL', tone: 'warning' });
    } else if (type === 'storm') {
      room.challengeTimer = scaleChallengeTimer(18);
      room.challengeTick = 0.35;
      sayAtPosition(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 'Do not stop moving.', { speaker: 'TRIAL', tone: 'warning' });
    }
    Neo.particles.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 46, life: 0.95, text: getChallengeTrialLabel(type), c: '#d7f6ff' });
  }

  function rollChallengeWeapon() {
    const owned = new Set(Object.keys(Neo.player?.ownedWeapons || {}).filter(k => Neo.player?.ownedWeapons?.[k]));
    const pool = [...WHITE_WEAPON_POOL];
    if (Neo.floor >= 4) pool.push(...PURPLE_WEAPON_POOL);
    if (Neo.floor >= 7) pool.push(...RED_WEAPON_POOL);
    const available = pool.filter(k => !owned.has(k));
    if (available.length === 0) return null;
    const challengeRandom = createRoomRandom(Neo.currentRoom, 'challenge:weapon-reward');
    return available[Math.floor(challengeRandom() * available.length)];
  }

  function spawnChallengeReward(text = 'TRIAL CLEARED') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge' || Neo.currentRoom.challengeRewardSpawned) return;
    Neo.currentRoom.challengeRewardSpawned = true;
    const rewardRandom = createRoomRandom(Neo.currentRoom, 'challenge:reward');
    Neo.pickups = Neo.pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup?.type));
    Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 16, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
    Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 + 36, type: 'potion' });
    dropCoins(Neo.ROOM_W / 2, Neo.ROOM_H / 2 + 4, 75 + Neo.floor * 15);
    grantXp(28 + Neo.floor * 5);
    const weaponKey = rollChallengeWeapon();
    if (weaponKey && Neo.player) {
      Neo.player.ownedWeapons[weaponKey] = true;
      const wName = Neo.WEAPON_DEFS[weaponKey]?.name || weaponKey;
      Neo.particles.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 68, life: 1.4, text: `+ ${wName}`, c: '#ffd700' });
    }
    Neo.particles.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 52, life: 1.05, text, c: '#d7f6ff' });
  }

  function completeChallengeTrial(text = 'TRIAL CLEARED') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge') return;
    Neo.currentRoom.cleared = true;
    Neo.currentRoom.challengeFailed = false;
    Neo.currentRoom.challengeTimer = 0;
    Neo.currentRoom.challengeTick = 0;
    Neo.currentRoom.challengeData = {};
    spawnChallengeReward(text);
    updateObjective();
    scheduleRunSave();
  }

  function failChallengeTrial(text = 'TRIAL FAILED') {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge') return;
    Neo.currentRoom.cleared = true;
    Neo.currentRoom.challengeFailed = true;
    Neo.currentRoom.challengeRewardSpawned = true;
    Neo.currentRoom.challengeTimer = 0;
    Neo.currentRoom.challengeTick = 0;
    Neo.currentRoom.challengeData = {};
    Neo.pickups = Neo.pickups.filter(pickup => !['challengeBomb', 'challengeRune', 'challengeStarter'].includes(pickup?.type));
    Neo.particles.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 52, life: 1.05, text, c: '#ff8b98' });
    updateObjective();
    scheduleRunSave();
  }

  function isBossType(type) {
    return Neo.BOSS_TYPES.has(type);
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
      damagePlayer(enemy.dmg, angle, 160, enemy.type);
      enemy.attackCd = 1.05;
    }
  }

  function updateCultMageEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.88;
      enemy.vy *= 0.88;
      aimEnemyBeam(enemy, dt, 2.9 * tuning.reaction);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.2, c: '#b455ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.58;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      tickEnemyBeam(enemy, dt, {
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
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.18);
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

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.76;
      enemy.vy *= 0.76;
      if (enemy.windup <= 0) {
        if (enemy.state === 'charge') {
          enemy.dashTime = 0.3;
          enemy.dashHit = false;
        } else {
          enemy.swingTime = 0.2;
        }
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 450;
      enemy.vy = Math.sin(enemy.dashAngle) * 450;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 7) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 260, enemy.type);
      }
      return;
    }

    if (enemy.swingTime > 0) {
      enemy.swingTime -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      if (enemy.swingTime <= 0 && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 24) {
        const angle = Math.atan2(dy, dx);
        damagePlayer(enemy.dmg + 3, angle, 210, enemy.type);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.8, dt);

    if (enemy.attackCd <= 0) {
      if (distance > 150) {
        enemy.state = 'charge';
        enemy.windup = 0.46;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 1.9;
      } else {
        enemy.state = 'stab';
        enemy.windup = 0.2;
        enemy.attackCd = 0.9;
      }
    }
  }

  function updateSniperEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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
      aimEnemyBeam(enemy, dt, 2.6 * tuning.reaction);
      if (enemy.windup <= 0) {
        const angle = enemy.beamAngle;
        const projectileSpeed = 360 * Math.min(1.4, tuning.reaction);
        Neo.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * projectileSpeed,
          vy: Math.sin(angle) * projectileSpeed,
          r: 5,
          life: 1.6,
          enemy: true,
          kind: 'sniper_round',
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
        damagePlayer(enemy.dmg + 2, Math.atan2(dy, dx), 170, enemy.type);
      }
      return;
    }

    const desired = 290;
    const direction = distance < desired - 20 ? -1 : distance > desired + 20 ? 1 : 0;
    if (enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.8)) {
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
    const tuning = getEnemyDifficultyTuning();
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
      aimEnemyBeam(enemy, dt, 3.2 * tuning.reaction);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.12, c: '#ffb55c' });
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
        const baseAngle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x);
        enemy.burstAngle = turnAngleToward(enemy.burstAngle || baseAngle, baseAngle, 0.22 * tuning.reaction);
        const spread = ((Neo.nextRandom('encounter') - 0.5) * 0.18) / Math.max(0.92, tuning.reaction);
        const fireAngle = enemy.burstAngle + spread;
        const projectileSpeed = 300 * Math.min(1.45, tuning.reaction + 0.06);
        Neo.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(fireAngle) * projectileSpeed,
          vy: Math.sin(fireAngle) * projectileSpeed,
          r: 4,
          life: 1.45,
          enemy: true,
          kind: 'machine_round',
          damage: enemy.dmg + 2,
        });
        Neo.particles.push({ x: enemy.x + Math.cos(fireAngle) * 10, y: enemy.y + Math.sin(fireAngle) * 10, life: 0.12, c: '#ffcf7a' });
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
        damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 180, enemy.type);
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
      if (!enemy.dashHit && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 6, enemy.dashAngle, 280, enemy.type);
      }
      return;
    }

    steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.1, dt);
    if (enemy.attackCd <= 0 && distance < 460) {
      enemy.windup = 0.62;
      enemy.dashAngle = Math.atan2(dy, dx);
      enemy.attackCd = 2.6;
    }
  }

  function updateSummonerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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
      const summonCount = Neo.floor >= 4 && tuning.supportPower >= 1.22 ? 3 : 2;
      for (let index = 0; index < summonCount; index += 1) {
        const angle = Neo.nextRandom('encounter') * Math.PI * 2;
        const px = enemy.x + Math.cos(angle) * (40 + index * 18);
        const py = enemy.y + Math.sin(angle) * (40 + index * 18);
        const safeSpawn = findSafeEnemySpawnPoint(clamp(px, 90, Neo.ROOM_W - 90), clamp(py, 90, Neo.ROOM_H - 90), 15);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
      Neo.particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.7, text: 'SUMMON', c: '#d59bff' });
    }

    if (enemy.attackCd <= 0 && distance < 360) {
      enemy.windup = 0.6 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.17);
      enemy.attackCd = 2.6 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateCultMageEnemy(enemy, dt);
    }
  }

  function updateShieldUnitEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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

    enemy.supportCd = Math.max(0, enemy.supportCd - dt);
    if (enemy.supportCd <= 0) {
      enemy.supportCd = 2.9 * Math.max(0.76, tuning.rangedCadence);
      Neo.enemies.forEach(other => {
        if (!other || other === enemy) return;
        if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        other.barrier = Math.max(other.barrier || 0, Math.round(other.max * 0.22 * tuning.supportPower));
      });
      enemy.barrier = Math.max(enemy.barrier || 0, Math.round(enemy.max * 0.14 * tuning.supportPower));
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: 82, c: '#7ed6ff' });
      Neo.particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'SHIELD', c: '#7ed6ff' });
    }

    if (enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 22) {
      damagePlayer(enemy.dmg, Math.atan2(dy, dx), 170, enemy.type);
      enemy.attackCd = 1.05 * tuning.rangedCadence;
    }
  }

  function updateHealerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const nearestWounded = Neo.enemies.reduce((best, candidate) => {
      if (candidate === enemy || candidate.hp >= candidate.max) return best;
      const d = dist(enemy.x, enemy.y, candidate.x, candidate.y);
      if (!best || d < best.distance) return { enemy: candidate, distance: d };
      return best;
    }, null);
    const target = nearestWounded?.enemy || Neo.player;
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
        if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
        const heal = Math.max(8, Math.round(other.max * (Neo.floor >= 4 ? 0.08 : 0.05) * tuning.supportPower));
        const nextHp = Math.min(other.max, other.hp + heal);
        if (nextHp !== other.hp) {
          other.hp = nextHp;
          healedAny = true;
          Neo.particles.push({ x: other.x, y: other.y - 16, life: 0.6, text: `+${heal}`, c: '#79f7bf' });
        }
      });
      if (healedAny) {
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: 76, c: '#79f7bf' });
        Neo.particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.65, text: 'HEAL', c: '#79f7bf' });
      }
    }

    if (enemy.attackCd <= 0 && !nearestWounded && distance < 350) {
      enemy.windup = 0.54 / tuning.reaction;
      enemy.beamAngle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x) + rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  function updateBossSpawnerEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (enemy.stun > 0) {
      enemy.vx *= 0.92;
      enemy.vy *= 0.92;
    } else {
      const desired = 300;
      const direction = distance < desired - 26 ? -1 : distance > desired + 18 ? 1 : 0;
      if (enemy.attackCd > 0.45 && trySteerEnemyToCover(enemy, dt, desired, 2.5)) {
        // Spawners should avoid open lanes while waiting on their beam.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.4, dt);
      }
    }

    enemy.bossSpawnTimer = Math.max(0, enemy.bossSpawnTimer - dt);
    const wholeSeconds = Math.ceil(enemy.bossSpawnTimer);
    if (wholeSeconds > 0 && wholeSeconds <= 10 && wholeSeconds !== enemy.bossSpawnWarnAt) {
      enemy.bossSpawnWarnAt = wholeSeconds;
      Neo.particles.push({ x: enemy.x, y: enemy.y - 20, life: 0.85, text: `BOSS ${wholeSeconds}`, c: '#ff8e6c' });
    }

    if (enemy.bossSpawnTimer <= 0) {
      const bossType = getFloorBossType();
      const safeSpawn = findSafeEnemySpawnPoint(enemy.x, enemy.y, 18);
      const bossSpawnerIdx = Neo.enemies.indexOf(enemy);
      if (bossSpawnerIdx >= 0) Neo.enemies.splice(bossSpawnerIdx, 1);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.8, ring: 120, c: '#ff9b5e' });
      if (safeSpawn) {
        const spawnedBoss = spawnEnemy(bossType, safeSpawn.x, safeSpawn.y, false);
        spawnedBoss.hp = Math.round(spawnedBoss.hp * 0.72);
        spawnedBoss.max = spawnedBoss.hp;
        Neo.particles.push({ x: spawnedBoss.x, y: spawnedBoss.y - 24, life: 1, text: 'BOSS SPAWNED', c: '#ffb07b' });
      }
      return;
    }

    if (enemy.attackCd <= 0 && distance < 420) {
      enemy.windup = 0.68 / tuning.reaction;
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.16);
      enemy.attackCd = 3.1 * tuning.rangedCadence;
    }

    if (enemy.windup > 0 || enemy.beamTime > 0) {
      updateLaserEnemy(enemy, dt);
    }
  }

  function updateCultQueenBoss(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;

    enemy.queenMissileCd = Math.max(0, Number(enemy.queenMissileCd || 0) - dt);
    if (enemy.queenMissileCd <= 0 && distance > 95 && distance < 580 && enemy.stun <= 0) {
      spawnCultQueenMissile(enemy, tuning);
      enemy.queenMissileCd = 3.4 * Math.max(0.78, tuning.rangedCadence);
    }

    enemy.summonCd = Math.max(0, enemy.summonCd - dt);
    if (enemy.summonCd <= 0) {
      enemy.summonCd = 4.6 * Math.max(0.74, tuning.rangedCadence);
      if (!enemy.queenSummonLineShown) {
        enemy.queenSummonLineShown = true;
        sayOverEntity(enemy, 'Come forth, faithful.', { holdTime: 1.7 });
      }
      const summonCount = tuning.supportPower >= 1.22 ? 4 : 3;
      for (let index = 0; index < summonCount; index += 1) {
        const angle = (Math.PI * 2 * index) / 3 + Neo.rng() * 0.8;
        const px = enemy.x + Math.cos(angle) * 54;
        const py = enemy.y + Math.sin(angle) * 54;
        const safeSpawn = findSafeEnemySpawnPoint(clamp(px, 90, Neo.ROOM_W - 90), clamp(py, 90, Neo.ROOM_H - 90), 15);
        if (safeSpawn) spawnEnemy('cult_follower', safeSpawn.x, safeSpawn.y, false);
      }
    }

    updateCultMageEnemy(enemy, dt);
    if (enemy.attackCd <= 0 && distance < enemy.r + Neo.player.r + 18) {
      damagePlayer(enemy.dmg + 4, Math.atan2(dy, dx), 250, enemy.type);
      enemy.attackCd = 0.95 * tuning.rangedCadence;
    }
  }

  function spawnCultQueenMissile(enemy, tuning = getEnemyDifficultyTuning()) {
    if (!enemy || !Neo.player) return;
    const count = tuning.supportPower >= 1.22 ? 2 : 1;
    const baseAngle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x);
    for (let index = 0; index < count; index += 1) {
      const spread = count === 1 ? 0 : (index === 0 ? -0.22 : 0.22);
      const angle = baseAngle + spread + (Neo.nextRandom('encounter') - 0.5) * 0.24;
      Neo.projectiles.push({
        x: enemy.x + Math.cos(angle) * (enemy.r + 8),
        y: enemy.y + Math.sin(angle) * (enemy.r + 8),
        vx: Math.cos(angle) * 165,
        vy: Math.sin(angle) * 165,
        r: 8,
        life: 2.45,
        enemy: true,
        kind: 'cult_missile',
        damage: Math.round(enemy.dmg * 0.78),
        knockback: 155,
        color: '#b455ff',
        homing: true,
        homingTurnRate: 2.15 * Math.min(1.24, tuning.reaction),
        homingSpeed: 235 * Math.min(1.18, tuning.reaction),
        homingAccel: 3.2,
      });
    }
    Neo.particles.push({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.55, text: 'MISSILE', c: '#d59bff' });
  }

  function updateBulkGolemBoss(enemy, dt) {
    enemy.speed = 78;
    enemy.jumpCd = Math.max(0, Number(enemy.jumpCd || 0) - dt);

    if (enemy.bulkJumpTime > 0) {
      enemy.bulkJumpTime = Math.max(0, enemy.bulkJumpTime - dt);
      const duration = Math.max(0.01, Number(enemy.bulkJumpDuration || 0.82));
      const progress = clamp(1 - enemy.bulkJumpTime / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      enemy.x = Number(enemy.bulkJumpStartX || enemy.x) + (Number(enemy.bulkJumpTargetX || enemy.x) - Number(enemy.bulkJumpStartX || enemy.x)) * eased;
      enemy.y = Number(enemy.bulkJumpStartY || enemy.y) + (Number(enemy.bulkJumpTargetY || enemy.y) - Number(enemy.bulkJumpStartY || enemy.y)) * eased;
      enemy.jumpZ = Math.sin(progress * Math.PI) * 92;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.airborne = true;
      if (progress > 0.62 && !enemy.bulkJumpWarned) {
        enemy.bulkJumpWarned = true;
        Neo.particles.push({ x: enemy.bulkJumpTargetX, y: enemy.bulkJumpTargetY, life: 0.32, ring: 76, c: '#ff8844' });
      }
      if (enemy.bulkJumpTime <= 0) {
        enemy.x = Number(enemy.bulkJumpTargetX || enemy.x);
        enemy.y = Number(enemy.bulkJumpTargetY || enemy.y);
        enemy.jumpZ = 0;
        enemy.airborne = false;
        enemy.bulkJumpWarned = false;
        enemy.jumpCd = 2.4;
        const impactRadius = 150;
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.55, ring: impactRadius, c: '#ff8844' });
        Neo.shake = Math.max(Neo.shake, 10);
        Neo.shakeT = Math.max(Neo.shakeT, 0.18);
        if (dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < impactRadius + Neo.player.r) {
          damagePlayer(Math.round(enemy.dmg * 0.85), Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x), 330, enemy.type);
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
      const aoeRadius = 240;
      const aoeDamage = Math.round(enemy.dmg * 1.2);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.5, ring: aoeRadius, c: '#ff8844' });
      blastRadius(enemy.x, enemy.y, aoeRadius, aoeDamage, '#ff8844', enemy);
      Neo.shake = 12;
      Neo.shakeT = 0.2;
    }
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nextX = enemy.x + (dx / distance) * enemy.speed * 0.25;
    const nextY = enemy.y + (dy / distance) * enemy.speed * 0.25;
    const pathBlocked = isBlocked(nextX, enemy.y, enemy.r) && isBlocked(enemy.x, nextY, enemy.r);
    if (enemy.jumpCd <= 0 && (pathBlocked || distance > 230)) {
      const angle = Math.atan2(dy, dx);
      const targetDistance = clamp(distance - 84, 80, 260);
      const preferredX = Neo.player.x - Math.cos(angle) * targetDistance + rand(-34, 34, 'encounter');
      const preferredY = Neo.player.y - Math.sin(angle) * targetDistance + rand(-34, 34, 'encounter');
      const landing = findSafeEnemySpawnPoint(
        clamp(preferredX, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r),
        clamp(preferredY, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r),
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
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.35, ring: 64, c: '#ffb067' });
        return;
      }
      enemy.jumpCd = 0.8;
    }
    updateGolemEnemy(enemy, dt);
  }

  function spawnPhaseSwords(count, damage) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.rng() * 0.25;
      const sx = Neo.player.x + Math.cos(angle) * 110;
      const sy = Neo.player.y + Math.sin(angle) * 110;
      const travel = Math.atan2(Neo.player.y - sy, Neo.player.x - sx);
      Neo.projectiles.push({
        x: sx,
        y: sy,
        vx: Math.cos(travel) * 260,
        vy: Math.sin(travel) * 260,
        r: 7,
        life: 1.25,
        enemy: true,
        kind: 'sword',
        damage,
      });
    }
  }

  function spawnGodSwordRing(enemy, count = 10, damage = 26) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Neo.nextRandom('encounter') * 0.18;
      const sx = enemy.x + Math.cos(angle) * 52;
      const sy = enemy.y + Math.sin(angle) * 52;
      Neo.projectiles.push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * 280,
        vy: Math.sin(angle) * 280,
        r: 8,
        life: 1.5,
        enemy: true,
        kind: 'god_sword',
        damage,
      });
    }
  }

  function triggerGodPhase(enemy, phase, title, color = '#fff4b8') {
    enemy.phase = phase;
    enemy.windup = 0;
    enemy.beamTime = 0;
    enemy.beamTick = 0;
    enemy.dashTime = 0;
    enemy.swingTime = 0;
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
      const jumpDistance = rand(320, 200, 'encounter');
      const targetX = clamp(enemy.x + nx * jumpDistance, Neo.WALL + enemy.r, Neo.ROOM_W - Neo.WALL - enemy.r);
      const targetY = clamp(enemy.y + ny * jumpDistance, Neo.WALL + enemy.r, Neo.ROOM_H - Neo.WALL - enemy.r);
      const landing = findSafeEnemySpawnPoint(targetX, targetY, Math.max(18, enemy.r || 18));
      if (landing) {
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.28, ring: 44, c: '#ffffff' });
        enemy.x = landing.x;
        enemy.y = landing.y;
        enemy.vx = 0;
        enemy.vy = 0;
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.34, ring: 58, c: '#ffffff' });
      }
    }

    enemy.state = `godPhase${phase}`;
    Neo.shake = Math.max(Neo.shake, 18 + phase * 2);
    Neo.shakeT = Math.max(Neo.shakeT, 0.34);
    Neo.particles.push({ x: enemy.x, y: enemy.y, life: 1, ring: 150 + phase * 14, c: color });
    Neo.particles.push({ x: enemy.x, y: enemy.y - 34, life: 1.2, text: `PHASE ${phase}`, c: color });
    Neo.particles.push({ x: enemy.x, y: enemy.y - 14, life: 1, text: title, c: '#ffffff' });
  }

  function spawnGodCouncil(enemy) {
    const bossTypes = ['queen_cult', 'bulk_golem', 'artificer_knave'];
    const spawnAngles = [-Math.PI * 0.5, Math.PI * 0.16, Math.PI * 0.84];
    bossTypes.forEach((type, index) => {
      const angle = spawnAngles[index] || ((Math.PI * 2 * index) / bossTypes.length);
      const px = clamp(enemy.x + Math.cos(angle) * 220, 110, Neo.ROOM_W - 110);
      const py = clamp(enemy.y + Math.sin(angle) * 220, 110, Neo.ROOM_H - 110);
      const safeSpawn = findSafeEnemySpawnPoint(px, py, 18) || findSafeEnemySpawnPoint(Neo.ROOM_W / 2, Neo.ROOM_H / 2, 18);
      if (!safeSpawn) return;
      const boss = spawnEnemy(type, safeSpawn.x, safeSpawn.y, false);
      boss.hp = Math.round(boss.hp * 0.85);
      boss.max = boss.hp;
      boss.attackCd = Math.min(boss.attackCd, 0.8);
      Neo.particles.push({ x: boss.x, y: boss.y - 24, life: 1.05, text: getBossLabel(type), c: '#ffcf8a' });
    });
  }

  function updateArtificerBoss(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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

    if (enemy.phase === 1) {
      enemy.speed = 132;
      updateKnaveEnemy(enemy, dt);
      return;
    }

    if (enemy.phase === 2) {
      enemy.speed = 120;
      if (enemy.attackCd <= 0) {
        spawnPhaseSwords(8, 14);
        enemy.attackCd = 2.35 * tuning.rangedCadence;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
      if (distance < enemy.r + Neo.player.r + 14 && enemy.swingTime <= 0) {
        enemy.swingTime = 0.2;
      }
      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        if (enemy.swingTime <= 0 && distance < enemy.r + Neo.player.r + 24) {
          damagePlayer(enemy.dmg + 3, Math.atan2(dy, dx), 210, enemy.type);
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
      if (enemy.windup <= 0) {
        const angle = Math.atan2(dy, dx);
        if (distance < enemy.r + Neo.player.r + 54) {
          damagePlayer(enemy.dmg + 16, angle, 340, 'storm');
        }
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.6, ring: 86, c: '#ffd27d' });
      }
    }
  }

  function updateLaserEnemy(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
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
      aimEnemyBeam(enemy, dt, 3.3 * tuning.reaction);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.16, c: '#aa66ff' });
      if (enemy.windup <= 0) {
        enemy.beamTime = 0.46;
        enemy.beamTick = 0;
      }
      return;
    }

    if (enemy.beamTime > 0) {
      tickEnemyBeam(enemy, dt, {
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
      enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.2);
      enemy.attackCd = 2.8 * tuning.rangedCadence;
    }
  }

  function updateEliteEnemyTraits(enemy, dt) {
    if (!enemy?.elite || !Array.isArray(enemy.eliteTypes)) return false;
    const distanceToPlayer = Neo.player ? dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) : Infinity;

    if (enemy.eliteTypes.includes('burning')) {
      enemy.burningTick = Math.max(0, Number(enemy.burningTick || 0) - dt);
      if (enemy.burningTick <= 0) {
        enemy.burningTick = 1.15;
        Neo.particles.push({ x: enemy.x + rand(-10, 10, 'fx'), y: enemy.y + rand(-10, 10, 'fx'), life: 0.24, c: '#ff9a3c' });
        if (distanceToPlayer < enemy.r + Neo.player.r + 34) applyFire(Neo.player, 1, 2.8);
      }
    }

    if (enemy.eliteTypes.includes('bleeding')) {
      enemy.bleedingTick = Math.max(0, Number(enemy.bleedingTick || 0) - dt);
      if (enemy.bleedingTick <= 0) {
        enemy.bleedingTick = 1.25;
        Neo.particles.push({ x: enemy.x + rand(-8, 8, 'fx'), y: enemy.y + rand(-8, 8, 'fx'), life: 0.22, c: '#ff4256' });
        if (distanceToPlayer < enemy.r + Neo.player.r + 28) applyStatus(Neo.player, 'bleed', 1, 2.2);
      }
    }

    if (!enemy.eliteTypes.includes('lasered')) return false;
    if (enemy.beamTime > 0 && enemy.state === 'elite_laser') {
      tickEnemyBeam(enemy, dt, {
        tick: enemy.eliteLaserMode === 'god_sweep' ? 0.055 : enemy.eliteLaserMode === 'turtle_wave' ? 0.08 : 0.1,
        range: enemy.eliteLaserMode === 'turtle_wave' ? 620 : enemy.eliteLaserMode === 'god_sweep' ? 560 : 430,
        knockback: enemy.eliteLaserMode === 'turtle_wave' ? 190 : enemy.eliteLaserMode === 'god_sweep' ? 145 : 125,
        damage: enemy.dmg + (enemy.eliteLaserMode === 'turtle_wave' ? 14 : enemy.eliteLaserMode === 'god_sweep' ? 8 : 0),
        speedDamp: 0.84,
        turnRate: enemy.eliteLaserMode === 'god_sweep' ? 0 : 2.6,
        onTick: activeEnemy => {
          if (activeEnemy.eliteLaserMode === 'god_sweep') activeEnemy.beamAngle += Number(activeEnemy.eliteSweepSpeed || 3.8) * 0.055;
        },
        onEnd: activeEnemy => {
          activeEnemy.state = 'idle';
          activeEnemy.eliteLaserCd = 1.35;
        },
      });
      return true;
    }

    enemy.eliteLaserCd = Math.max(0, Number(enemy.eliteLaserCd || 0) - dt);
    if (enemy.eliteLaserCd > 0 || distanceToPlayer > 520) return false;

    const modes = ['blood_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns', 'god_sweep'];
    const mode = modes[Number(enemy.eliteLaserModeIndex || 0) % modes.length];
    enemy.eliteLaserModeIndex = Number(enemy.eliteLaserModeIndex || 0) + 1;
    const angle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x);

    if (mode === 'power_disks') {
      for (let index = 0; index < 5; index += 1) {
        const spread = (index - 2) * 0.16;
        Neo.projectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle + spread) * 360,
          vy: Math.sin(angle + spread) * 360,
          r: 7,
          life: 1.15,
          enemy: true,
          kind: 'power_disk',
          damage: Math.round(enemy.dmg * 0.72),
          color: '#d890ff',
          knockback: 110,
        });
      }
      enemy.eliteLaserCd = 1.4;
      return false;
    }

    if (mode === 'blade_justice') {
      if (distanceToPlayer < 150) damagePlayer(enemy.dmg + 10, angle, 240, 'elite_blade_justice');
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.34, ring: 112, c: '#ffffff' });
      enemy.eliteLaserCd = 1.2;
      return false;
    }

    if (mode === 'lightning_columns') {
      for (let index = 0; index < 2; index += 1) {
        const px = clamp(Neo.player.x + rand(-70, 70, 'encounter'), Neo.WALL + 60, Neo.ROOM_W - Neo.WALL - 60);
        const py = clamp(Neo.player.y + rand(-70, 70, 'encounter'), Neo.WALL + 60, Neo.ROOM_H - Neo.WALL - 60);
        Neo.hazards.push({ kind: 'lightning_column', x: px, y: py, r: 46, ttl: 1.25, tick: 0, interval: 0.36, damage: Math.round(enemy.dmg * 0.78), enemy: true, source: enemy.type || 'lightning_column' });
        Neo.particles.push({ x: px, y: py, life: 0.28, ring: 18, c: '#8dd4ff' });
      }
      enemy.eliteLaserCd = 1.6;
      return false;
    }

    enemy.state = 'elite_laser';
    enemy.eliteLaserMode = mode === 'god_sweep' ? 'god_sweep' : mode === 'turtle_wave' ? 'turtle_wave' : 'blood_beam';
    enemy.beamAngle = angle;
    enemy.beamTime = enemy.eliteLaserMode === 'god_sweep' ? 1.4 : enemy.eliteLaserMode === 'turtle_wave' ? 0.9 : 0.56;
    enemy.beamTick = 0;
    enemy.eliteSweepSpeed = (Neo.nextRandom('encounter') < 0.5 ? -1 : 1) * 4.1;
    enemy.eliteLaserCd = 99;
    Neo.particles.push({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.45, text: Neo.MOVE_DEFS[mode]?.name || 'LASER', c: '#8dd4ff' });
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
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.14, c: '#ff8844' });
      if (enemy.windup <= 0) {
        enemy.dashTime = 0.32;
        enemy.dashHit = false;
      }
      return;
    }

    if (enemy.dashTime > 0) {
      enemy.dashTime -= dt;
      enemy.vx = Math.cos(enemy.dashAngle) * 430;
      enemy.vy = Math.sin(enemy.dashAngle) * 430;
      if (!enemy.dashHit && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + 4, enemy.dashAngle, 240, enemy.type);
      }
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
    const base = Neo.MOVE_BASE_STATS[moveKey]?.damage ?? fallback;
    const powerBonus = Math.max(0, Number(enemy?.dmg || 0) - 18) * 0.35;
    return Math.max(1, Math.round(base + powerBonus));
  }

  function getPredictedPlayerPoint(lead = 0.22) {
    return {
      x: clamp(Neo.player.x + Number(Neo.player.vx || 0) * lead, Neo.WALL + Neo.player.r, Neo.ROOM_W - Neo.WALL - Neo.player.r),
      y: clamp(Neo.player.y + Number(Neo.player.vy || 0) * lead, Neo.WALL + Neo.player.r, Neo.ROOM_H - Neo.WALL - Neo.player.r),
    };
  }

  function mirrorHitArc(enemy, angle, range, arc, damage, knockback, source = 'mirror_knight') {
    const d = dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y);
    if (d > range + Neo.player.r) return false;
    const targetAngle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x);
    const diff = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
    if (diff > arc) return false;
    damagePlayer(damage, angle, knockback, source);
    return true;
  }

  function mirrorBlastPlayer(enemy, radius, damage, knockback, color, source = 'mirror_knight') {
    Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.42, ring: radius, c: color });
    if (dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) > radius + Neo.player.r) return false;
    const angle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x);
    damagePlayer(damage, angle, knockback, source);
    return true;
  }

  function fireMirrorProjectiles(enemy, angle, count, spread, speed, damage, options = {}) {
    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
      const a = angle + offset;
      Neo.projectiles.push({
        x: enemy.x + Math.cos(a) * (enemy.r + 7),
        y: enemy.y + Math.sin(a) * (enemy.r + 7),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: options.r || 6,
        life: options.life || 1.25,
        enemy: true,
        kind: options.kind || 'mirror_shot',
        color: options.color || '#d7f6ff',
        damage,
        knockback: options.knockback || 120,
        homing: !!options.homing,
        homingSpeed: options.homingSpeed,
        homingTurnRate: options.homingTurnRate,
        homingAccel: options.homingAccel,
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
      if (weaponKey === 'hunters_bow' || weaponKey === 'magenta_degale' || weaponKey === 'void_piercer' || weaponKey === 'granillia_lightning_spear') {
        fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, weaponKey === 'magenta_degale' ? 880 : 760, damage, {
          kind: weaponKey,
          color: Neo.WEAPON_DEFS[weaponKey]?.color || '#d7f6ff',
          r: weaponKey === 'magenta_degale' ? 7 : 6,
          life: weaponKey === 'void_piercer' ? 1.2 : 0.9,
          knockback,
        });
        return true;
      }
      if (weaponKey === 'metao_fire_staff') {
        fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.18, 345, damage, { kind: 'fireball', color: '#ffb874', r: 8, life: 1.4, knockback });
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
      if (weaponKey === 'aegis_shield_weapon') {
        enemy.barrier = Math.max(enemy.barrier || 0, Math.round(enemy.max * 0.12));
        enemy.inv = Math.max(enemy.inv || 0, 0.32);
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.44, ring: 34, c: '#9ae9ff' });
        return true;
      }
      mirrorHitArc(enemy, angleToPlayer, range + 10, weaponKey === 'excalibur' ? Math.PI : Neo.ATTACKS.melee.arc + 0.18, damage, knockback, `mirror_${weaponKey}`);
      return true;
    }
    const move = getMirrorMove(enemy, 'melee');
    const damage = getMirrorMoveDamage(enemy, move, enemy.dmg || Neo.ATTACKS.melee.damage);
    enemy.swingTime = Neo.ATTACKS.melee.active;
    enemy.attackCd = getMirrorSkillCooldown(enemy, 'melee');
    if (move === 'fire_balls') {
      fireMirrorProjectiles(enemy, angleToPlayer, 3, 0.16, 340, Math.max(14, damage - 4), { kind: 'fireball', color: '#ff8844', r: 8, life: 1.45, knockback: 110 });
      return true;
    }
    if (move === 'narwal_fight') {
      mirrorHitArc(enemy, angleToPlayer, 138, 1.45, Math.max(22, damage + 4), 300);
      fireMirrorProjectiles(enemy, angleToPlayer, 1, 0, 740, Math.max(16, damage - 8), { kind: 'narwal_fight', color: '#ffd1ea', r: 6, life: 0.9, knockback: 190 });
      return true;
    }
    if (move === 'smite') {
      const didHit = mirrorHitArc(enemy, angleToPlayer, Neo.ATTACKS.melee.range + 18, Neo.ATTACKS.melee.arc + 0.18, damage, Neo.ATTACKS.melee.push);
      if (didHit) damagePlayer(Math.max(8, Math.round(damage * 0.45)), angleToPlayer, 70, 'mirror_smite');
      Neo.particles.push({ x: Neo.player.x, y: Neo.player.y, life: 0.24, ring: 18, c: '#eaf2ff' });
      return true;
    }
    mirrorHitArc(enemy, angleToPlayer, Neo.ATTACKS.melee.range + 10, Neo.ATTACKS.melee.arc + 0.12, damage, Neo.ATTACKS.melee.push);
    return true;
  }

  function startMirrorLaser(enemy, angleToPlayer, distance) {
    const move = getMirrorMove(enemy, 'laser');
    const predicted = getPredictedPlayerPoint(0.32);
    const aimedAngle = Math.atan2(predicted.y - enemy.y, predicted.x - enemy.x);
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
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.44, ring: 36, c: '#fff6a3' });
      return true;
    }
    if (move === 'lightning_columns') {
      [-38, 38].forEach(offset => {
        const ox = Math.cos(aimedAngle + Math.PI / 2) * offset;
        const oy = Math.sin(aimedAngle + Math.PI / 2) * offset;
        Neo.hazards.push({
          kind: 'lightning_column',
          enemy: true,
          source: 'mirror_lightning',
          x: predicted.x + ox,
          y: predicted.y + oy,
          r: 48,
          ttl: 3.6,
          tick: 0.18,
          interval: 0.42,
          damage: getMirrorMoveDamage(enemy, move, 18),
        });
        Neo.particles.push({ x: predicted.x + ox, y: predicted.y + oy, life: 0.45, ring: 24, c: '#8dd4ff' });
      });
      return true;
    }
    enemy.state = 'mirrorLaser';
    enemy.windup = move === 'god_sweep' ? 0.36 : distance < 150 ? 0.34 : 0.46;
    enemy.beamAngle = aimedAngle + rollEnemyBeamBias(enemy, move === 'god_sweep' ? 0.08 : 0.1);
    return true;
  }

  function startMirrorSmash(enemy, angleToPlayer) {
    const move = getMirrorMove(enemy, 'smash');
    const damage = getMirrorMoveDamage(enemy, move, enemy.smashDamage || Neo.ATTACKS.smash.damage);
    enemy.attackCd = 0.6;
    enemy.mirrorSmashCd = getMirrorSkillCooldown(enemy, 'smash');
    if (move === 'kicky_kick') {
      mirrorBlastPlayer(enemy, 142, Math.max(damage, 84), 680, '#ff7fc2', 'mirror_kick');
      enemy.vx -= Math.cos(angleToPlayer) * 210;
      enemy.vy -= Math.sin(angleToPlayer) * 210;
      return true;
    }
    if (move === 'chaos_burst') {
      for (let index = 0; index < 4; index += 1) {
        const a = angleToPlayer + (index - 1.5) * 0.38;
        const px = Neo.player.x + Math.cos(a) * rand(46, -46, 'encounter');
        const py = Neo.player.y + Math.sin(a) * rand(46, -46, 'encounter');
        Neo.particles.push({ x: px, y: py, life: 0.38, ring: 36, c: '#c971ff' });
        if (dist(Neo.player.x, Neo.player.y, px, py) <= 58 + Neo.player.r) damagePlayer(Math.max(16, Math.round(damage * 0.62)), Math.atan2(Neo.player.y - py, Neo.player.x - px), 120, 'mirror_chaos');
      }
      return true;
    }
    if (move === 'healing_zone') {
      enemy.hp = Math.min(enemy.max, enemy.hp + enemy.max * 0.08);
      mirrorBlastPlayer(enemy, 118, Math.max(10, damage), 120, '#35ff6f', 'mirror_zone');
      return true;
    }
    if (move === 'fire_circle' || move === 'floor_lava') {
      mirrorBlastPlayer(enemy, move === 'floor_lava' ? 156 : 108, Math.max(12, damage), 150, '#ff7b32', 'mirror_fire');
      applyFire(Neo.player, move === 'floor_lava' ? 2 : 1, 3.2);
      return true;
    }
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
      const safePoint = findSafePointNearTarget(predicted.x + Math.cos(backAngle) * 72, predicted.y + Math.sin(backAngle) * 72, enemy.r, 130, 16);
      if (safePoint) {
        enemy.x = safePoint.x;
        enemy.y = safePoint.y;
        enemy.inv = Math.max(enemy.inv || 0, 0.22);
        Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.3, ring: 22, c: '#b99cff' });
      }
      return true;
    }
    if (move === 'nimrod_stomp') {
      const safePoint = findSafePointNearTarget(predicted.x, predicted.y, enemy.r, 90, 14);
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
      Neo.particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.55, text: move === 'flying_unhitable' ? 'FLY HIGH' : "COWARD'S WAY", c: '#8dffcf' });
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
      if (enemy.state === 'mirrorLaser') aimEnemyBeam(enemy, dt, 3.4);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.16, c: '#d7f6ff' });
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
          mirrorBlastPlayer(enemy, Neo.ATTACKS.smash.radius + 8, enemy.smashDamage || enemy.dmg + 18, 300, '#ff6dc7');
          enemy.attackCd = 0.75;
        }
      }
      return;
    }

    if (enemy.beamTime > 0) {
      const laserMove = getMirrorMove(enemy, 'laser');
      tickEnemyBeam(enemy, dt, {
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
      if (!enemy.dashHit && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 6) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + (dashMove === 'zip_lightning' ? 18 : 8), enemy.dashAngle, dashMove === 'zip_lightning' ? 300 : 240, enemy.type);
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

    const laserMove = getMirrorMove(enemy, 'laser');
    const smashMove = getMirrorMove(enemy, 'smash');
    const desiredRange = enemy.mirrorSmashCd <= 0
      ? (smashMove === 'kicky_kick' ? 126 : 118)
      : enemy.mirrorLaserCd <= 0 && !['blade_justice'].includes(laserMove)
        ? 230
        : 112;
    const preferred = distance > desiredRange + 24 ? 1 : distance < desiredRange - 26 ? -1 : 0.2;
    const strafe = distance < 300 ? 0.34 : 0;
    steerEnemy(
      enemy,
      dx / distance * preferred + -dy / distance * strafe,
      dy / distance * preferred + dx / distance * strafe,
      enemy.speed,
      6.2,
      dt
    );

    const mirrorWeapon = enemy.mirrorWeapon || '';
    const rangedMirrorWeapon = ['hunters_bow', 'metao_fire_staff', 'magenta_degale', 'magenta_p90', 'granillia_lightning_spear', 'void_piercer', 'lazer_glasses'].includes(mirrorWeapon);
    const mirrorWeaponRange = Number(enemy.mirrorWeaponStats?.range || 0);
    if (mirrorWeapon && enemy.attackCd <= 0 && (rangedMirrorWeapon ? distance < 520 : distance < mirrorWeaponRange + Neo.player.r + 14)) {
      startMirrorMelee(enemy, angleToPlayer);
      return;
    }

    if (distance < Neo.ATTACKS.melee.range + Neo.player.r + 6 && enemy.attackCd <= 0) {
      startMirrorMelee(enemy, angleToPlayer);
      return;
    }

    if (enemy.attackCd <= 0) {
      if (enemy.mirrorSmashCd <= 0 && distance < 178) {
        startMirrorSmash(enemy, angleToPlayer);
      } else if (enemy.mirrorLaserCd <= 0 && (distance > 96 || laserMove === 'blade_justice')) {
        startMirrorLaser(enemy, angleToPlayer, distance);
      } else if (enemy.mirrorDashCd <= 0 && (distance > 170 || getMirrorMove(enemy, 'dash') === 'warp')) {
        startMirrorDash(enemy, angleToPlayer, distance);
      } else {
        enemy.attackCd = 0.18;
      }
    }
  }

  function updateChallengeRoomState(dt) {
    if (!Neo.currentRoom || Neo.currentRoom.type !== 'challenge' || Neo.currentRoom.cleared || !Neo.currentRoom.challengeStarted) return;
    const type = Neo.currentRoom.challengeType || 'mirror';

    if (type === 'stillness') {
      const graceTimer = Math.max(0, Number(Neo.currentRoom.challengeData?.graceTimer || 0));
      Neo.currentRoom.challengeData.graceTimer = Math.max(0, graceTimer - dt);
      const bindings = window.NeoSettings?.getBindings();
      const rightKey = bindings ? bindings.right : 'd';
      const leftKey = bindings ? bindings.left : 'a';
      const downKey = bindings ? bindings.down : 's';
      const upKey = bindings ? bindings.up : 'w';
      const dashKey = bindings ? bindings.dash : 'shift';
      const moved = !!(
        Neo.keys[rightKey] || Neo.keys.arrowright
        || Neo.keys[leftKey] || Neo.keys.arrowleft
        || Neo.keys[downKey] || Neo.keys.arrowdown
        || Neo.keys[upKey] || Neo.keys.arrowup
        || Neo.keys[dashKey]
      );
      if (!moved) {
        Neo.currentRoom.challengeTimer = Math.max(0, (Neo.currentRoom.challengeTimer || 0) - dt);
        if (Neo.currentRoom.challengeTimer <= 0) completeChallengeTrial('STILLNESS HELD');
      } else if (graceTimer <= 0) {
        Neo.particles.push({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'TRIAL FAILED', c: '#ff8b98' });
        failChallengeTrial('STILLNESS BROKEN');
      }
      return;
    }

    if (type === 'survival') {
      Neo.currentRoom.challengeTimer = Math.max(0, (Neo.currentRoom.challengeTimer || 0) - dt);
      Neo.currentRoom.challengeTick = Math.max(0, (Neo.currentRoom.challengeTick || 0) - dt);
      if (Neo.currentRoom.challengeTick <= 0) {
        Neo.currentRoom.challengeTick = 1.7;
        spawnTrialEnemyWave(Neo.floor >= 6 ? 2 : 1);
      }
      if (Neo.currentRoom.challengeTimer <= 0) {
        Neo.enemies.splice(0, Neo.enemies.length);
        completeChallengeTrial('SURVIVED');
      }
      return;
    }

    if (type === 'runes') {
      Neo.currentRoom.challengeTimer = Math.max(0, (Neo.currentRoom.challengeTimer || 0) - dt);
      if (Neo.currentRoom.challengeTimer <= 0) {
        failChallengeTrial('RUNES FADING');
      }
      return;
    }

    if (type === 'storm') {
      Neo.currentRoom.challengeTimer = Math.max(0, (Neo.currentRoom.challengeTimer || 0) - dt);
      Neo.currentRoom.challengeTick = Math.max(0, (Neo.currentRoom.challengeTick || 0) - dt);
      if (Neo.currentRoom.challengeTick <= 0) {
        Neo.currentRoom.challengeTick = 0.85;
        for (let index = 0; index < 3; index += 1) {
          const px = 110 + Neo.nextRandom('world') * (Neo.ROOM_W - 220);
          const py = 110 + Neo.nextRandom('world') * (Neo.ROOM_H - 220);
          Neo.hazards.push({
            kind: 'lightning_column',
            x: px,
            y: py,
            r: 52,
            ttl: 1.6,
            tick: 0,
            interval: 0.42,
            damage: 18 + Neo.floor,
            enemy: true,
            source: 'storm',
          });
          Neo.particles.push({ x: px, y: py, life: 0.35, ring: 18, c: '#8dd4ff' });
        }
      }
      if (Neo.currentRoom.challengeTimer <= 0) completeChallengeTrial('STORM ENDED');
    }
  }

  function updateGod(enemy, dt) {
    const tuning = getEnemyDifficultyTuning();
    const dx = Neo.player.x - enemy.x;
    const dy = Neo.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const hpPct = enemy.hp / enemy.max;

    if (enemy.rebirthUsed && !enemy.phase3Triggered && hpPct <= 0.2) {
      enemy.phase3Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.2);
      enemy.speed *= 1.08;
      enemy.novaCd = 1.9;
      triggerGodPhase(enemy, 3, 'COUNCIL OF BOSSES', '#ffd27d');
      spawnGodCouncil(enemy);
      playGodDialogue(3);
      return;
    } else if (enemy.rebirthUsed && enemy.phase3Triggered && !enemy.phase4Triggered && hpPct <= 0.12) {
      enemy.phase4Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.16);
      enemy.speed *= 1.06;
      enemy.novaCd = 1.25;
      enemy.judgementCd = 2.7;
      triggerGodPhase(enemy, 4, 'HOLY ONSLAUGHT', '#ff9f6e');
      spawnGodSwordRing(enemy, 24, Math.round(enemy.dmg * 1.05));
      playGodDialogue(4);
      return;
    } else if (enemy.rebirthUsed && enemy.phase4Triggered && !enemy.phase5Triggered && hpPct <= 0.06) {
      enemy.phase5Triggered = true;
      enemy.dmg = Math.round(enemy.dmg * 1.22);
      enemy.speed *= 1.08;
      enemy.novaCd = 0.78;
      enemy.judgementCd = 1.45;
      triggerGodPhase(enemy, 5, 'LAST JUDGEMENT', '#ff5a5a');
      spawnGodSwordRing(enemy, 32, Math.round(enemy.dmg * 1.15));
      playGodDialogue(5);
      return;
    }

    const phaseLevel = enemy.phase || 1;
    const phaseTwo = phaseLevel >= 2;
    const phaseFour = phaseLevel >= 4;
    const phaseFive = phaseLevel >= 5;
    const cadenceMult = phaseFive ? 0.42 : phaseFour ? 0.52 : phaseLevel >= 3 ? 0.6 : phaseTwo ? 0.68 : 1;
    const reactionMult = phaseFive ? 1.45 : phaseFour ? 1.34 : phaseLevel >= 3 ? 1.28 : phaseTwo ? 1.22 : 1;
    const desired = phaseFive ? 138 : phaseFour ? 146 : phaseTwo ? 156 : 190;

    if (phaseFour) {
      enemy.novaCd = Math.max(0, (enemy.novaCd || 0) - dt);
      if (enemy.novaCd <= 0) {
        const swordCount = phaseFive ? 20 : 14;
        const swordDamage = Math.round(enemy.dmg * (phaseFive ? 1.08 : 0.92));
        spawnGodSwordRing(enemy, swordCount, swordDamage);
        enemy.novaCd = phaseFive ? 0.78 : 1.25;
      }
    }

    if (phaseFive) {
      enemy.judgementCd = Math.max(0, (enemy.judgementCd || 0) - dt);
      if (enemy.judgementCd <= 0) {
        spawnPhaseSwords(16, Math.round(enemy.dmg * 0.82));
        Neo.particles.push({ x: Neo.player.x, y: Neo.player.y, life: 0.42, ring: 118, c: '#ff7a7a' });
        enemy.judgementCd = 1.45;
      }
    }

    if (enemy.windup > 0) {
      enemy.windup -= dt;
      enemy.vx *= 0.74;
      enemy.vy *= 0.74;
      if (enemy.state === 'godLaser') aimEnemyBeam(enemy, dt, (0.68 + (tuning.reaction - 1) * 3.6) * reactionMult);
      Neo.particles.push({ x: enemy.x, y: enemy.y, life: 0.18, c: '#ffffff' });
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
      const isSweep = enemy.state === 'godSweep';
      tickEnemyBeam(enemy, dt, {
        tick: (isSweep ? 0.045 : 0.08) * Math.max(0.64, tuning.rangedCadence * cadenceMult),
        range: enemy.beamRange || 620,
        knockback: isSweep ? (phaseFour ? 260 : 210) : (phaseFour ? 180 : 150),
        damage: isSweep ? enemy.dmg + (phaseFive ? 38 : phaseTwo ? 28 : 18) : Math.round((enemy.dmg + (phaseFour ? 18 : phaseTwo ? 12 : 6)) * 0.25),
        speedDamp: 0.86,
        turnRate: isSweep ? 0 : (0.34 + (tuning.reaction - 1) * 2.8) * reactionMult,
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
      if (!enemy.dashHit && dist(enemy.x, enemy.y, Neo.player.x, Neo.player.y) < enemy.r + Neo.player.r + 10) {
        enemy.dashHit = true;
        damagePlayer(enemy.dmg + (phaseFive ? 34 : phaseTwo ? 24 : 12), enemy.dashAngle, phaseFour ? 410 : phaseTwo ? 360 : 300, enemy.type);
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
      damagePlayer(enemy.dmg + (phaseFive ? 26 : phaseTwo ? 18 : 10), angle, phaseFour ? 370 : phaseTwo ? 320 : 260, enemy.type);
      enemy.attackCd = 0.8 * tuning.rangedCadence * cadenceMult;
      return;
    }

    if (enemy.attackCd <= 0) {
      const roll = Neo.nextRandom('encounter');
      if ((phaseTwo && distance > 250 && roll > (phaseFour ? 0.46 : 0.52)) || (!phaseTwo && distance > 300 && roll > 0.68)) {
        enemy.state = 'godSweep';
        enemy.windup = 1.15 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.1);
        enemy.sweepDir = Neo.nextRandom('encounter') < 0.5 ? -1 : 1;
      } else if (roll > (phaseFive ? 0.16 : phaseTwo ? 0.26 : 0.42)) {
        enemy.state = 'godLaser';
        enemy.windup = 0.82 / (tuning.reaction * reactionMult);
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, phaseFour ? 0.24 : phaseTwo ? 0.2 : 0.17);
      } else if (roll > (phaseFour ? 0.04 : phaseTwo ? 0.08 : 0.18)) {
        enemy.state = 'godSwordRing';
        enemy.windup = 0.6 / (tuning.reaction * reactionMult);
      } else {
        enemy.state = 'godCharge';
        enemy.windup = 0.44 / (tuning.reaction * reactionMult);
        enemy.dashAngle = Math.atan2(dy, dx);
      }
      enemy.attackCd = 2.15 * tuning.rangedCadence * cadenceMult;
    }
  }

  function steerEnemy(enemy, dirX, dirY, maxSpeed, accel, dt) {
    enemy.vx += (dirX * maxSpeed - enemy.vx) * accel * dt;
    enemy.vy += (dirY * maxSpeed - enemy.vy) * accel * dt;
  }

  function moveCircle(entity, dt) {
    if (entity.airborne) {
      entity.x = clamp(entity.x, Neo.WALL + entity.r, Neo.ROOM_W - Neo.WALL - entity.r);
      entity.y = clamp(entity.y, Neo.WALL + entity.r, Neo.ROOM_H - Neo.WALL - entity.r);
      return;
    }
    const nextX = entity.x + entity.vx * dt;
    const nextY = entity.y + entity.vy * dt;
    if (!isBlocked(nextX, entity.y, entity.r)) entity.x = nextX;
    else entity.vx *= -0.4;
    if (!isBlocked(entity.x, nextY, entity.r)) entity.y = nextY;
    else entity.vy *= -0.4;
    entity.x = clamp(entity.x, Neo.WALL + entity.r, Neo.ROOM_W - Neo.WALL - entity.r);
    entity.y = clamp(entity.y, Neo.WALL + entity.r, Neo.ROOM_H - Neo.WALL - entity.r);
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
  Neo.getEnemyDifficultyMultiplier = getEnemyDifficultyMultiplier;
  Neo.canSpawnEliteEnemies = canSpawnEliteEnemies;
  Neo.rollEliteInventory = rollEliteInventory;
  Neo.rollBlessedEliteInventory = rollBlessedEliteInventory;
  Neo.rollEliteTypes = rollEliteTypes;
  Neo.applyEliteInventory = applyEliteInventory;
  Neo.applyEliteTypes = applyEliteTypes;
  Neo.scaleEnemyStats = scaleEnemyStats;
  Neo.spawnEnemy = spawnEnemy;
  Neo.spawnGodBoss = spawnGodBoss;
  Neo.playGodDialogue = playGodDialogue;
  Neo.tryPlayKnaveKnightCutscene = tryPlayKnaveKnightCutscene;
  Neo.tryPlayQueenMetaoCutscene = tryPlayQueenMetaoCutscene;
  Neo.tryPlayBossIntroCutscene = tryPlayBossIntroCutscene;
  Neo.sayOverEntity = sayOverEntity;
  Neo.sayAtPosition = sayAtPosition;
  Neo.getMirrorChampionStats = getMirrorChampionStats;
  Neo.spawnMirrorChampion = spawnMirrorChampion;
  Neo.spawnChallengeStarter = spawnChallengeStarter;
  Neo.spawnChallengeBombs = spawnChallengeBombs;
  Neo.spawnChallengeRunes = spawnChallengeRunes;
  Neo.spawnTrialEnemyWave = spawnTrialEnemyWave;
  Neo.beginChallengeTrial = beginChallengeTrial;
  Neo.rollChallengeWeapon = rollChallengeWeapon;
  Neo.spawnChallengeReward = spawnChallengeReward;
  Neo.completeChallengeTrial = completeChallengeTrial;
  Neo.failChallengeTrial = failChallengeTrial;
  Neo.isBossType = isBossType;
  Neo.updateHunterEnemy = updateHunterEnemy;
  Neo.updateCultMageEnemy = updateCultMageEnemy;
  Neo.updateArtificerBoss = updateArtificerBoss;
  Neo.updateLaserEnemy = updateLaserEnemy;
  Neo.updateEliteEnemyTraits = updateEliteEnemyTraits;
  Neo.updateChargerEnemy = updateChargerEnemy;
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
  Neo.updateChallengeRoomState = updateChallengeRoomState;
  Neo.updateGod = updateGod;
  Neo.steerEnemy = steerEnemy;
  Neo.moveCircle = moveCircle;
})();
