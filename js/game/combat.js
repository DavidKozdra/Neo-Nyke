  function scaleDamageAgainstEnemy(enemy, damage, options = {}) {
    const stats = getItemStats();
    const applyBleedBonus = options.applyBleedBonus !== false;
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * (isChallengeActive('glass_cannon') ? 1.25 : 1);
    if (applyBleedBonus && getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.round(powered * stats.bleedDamageMultiplier);
    }
    return Math.round(powered);
  }

  function getEnemyBleedResistance(enemy) {
    const loopNumber = Math.max(1, Math.floor((floor - 1) / 10) + 1);
    const floorInLoop = ((floor - 1) % 10) + 1;
    let resistance = 1;
    resistance += Math.max(0, floorInLoop - 1) * BLEED_RESIST_SCALING.floorInLoop;
    resistance += Math.max(0, loopNumber - 1) * BLEED_RESIST_SCALING.loop;
    if (enemy?.elite) resistance += BLEED_RESIST_SCALING.elite;
    if (enemy?.miniBoss) resistance += BLEED_RESIST_SCALING.miniBoss;
    if (isBossType(enemy?.type) || enemy?.type === 'god') resistance += BLEED_RESIST_SCALING.boss;
    if (enemy?.type === 'rival' || enemy?.type === 'mirror_knight') resistance += BLEED_RESIST_SCALING.rival;
    return Math.max(1, resistance);
  }

  function scaleBleedDamageAgainstEnemy(enemy, stacks) {
    const baseBleed = 1.8 + Math.max(1, Number(stacks || 1)) * 2.2;
    const preResist = scaleDamageAgainstEnemy(enemy, baseBleed, { applyBleedBonus: false });
    const reduced = preResist / getEnemyBleedResistance(enemy);
    return Math.max(1, Math.round(reduced));
  }

  function getPlayerBaseDamage() {
    const characterMultiplier = getCharacterDef().damageMultiplier || 1;
    return Math.max(1, (ATTACKS.melee.damage + (player?.attackPower || 0)) * characterMultiplier);
  }

  function getEquippedMove(slot) {
    const moveKey = player?.equippedMoves?.[slot];
    if (MOVE_DEFS[moveKey]?.slot === slot) return moveKey;
    return getDefaultMovesForCharacter(player?.character || chosenCharacter)[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
  }

  function getEquippedWeapon() {
    const key = player?.equippedWeapon || '';
    return WEAPON_DEFS[key] ? key : '';
  }

  function getWeaponBaseCooldown(weaponKey) {
    let base;
    if (weaponKey === 'extending_staff') base = 0.5;
    else if (weaponKey === 'hunters_bow') base = 0.4;
    else if (weaponKey === 'thorns_bleed_blade') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'lazer_glasses') base = 3.6;
    else if (weaponKey === 'metao_fire_staff') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'magenta_degale') base = 1.5;
    else if (weaponKey === 'magenta_p90') base = 1.8;
    else if (weaponKey === 'granillia_lightning_spear') base = ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'excalibur') base = 2;
    else if (weaponKey === 'golden_fleece') base = 0.5;
    else if (weaponKey === 'void_piercer') base = 0.8;
    else if (weaponKey === 'aegis_shield_weapon') base = 8;
    else base = 0.5;
    const bonus = getAnvilWeaponBonus(weaponKey, 'cooldown');
    return Math.max(0.05, base + bonus);
  }

  function spawnWeaponProjectile(config = {}) {
    const angle = Number(config.angle || 0);
    const speed = Number(config.speed || 520);
    projectiles.push({
      x: config.x ?? player.x,
      y: config.y ?? player.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Number(config.r || 5),
      life: Number(config.life || 1.2),
      damage: Number(config.damage || 18),
      kind: config.kind || 'weapon_shot',
      color: config.color || '#ffd7aa',
      knockback: Number(config.knockback || 140),
      pierceCount: Number(config.pierceCount || 0),
      hitOptions: config.hitOptions || null,
      trail: [],
    });
  }

  function fireWeaponSweep(damage, range, arc, push, color, options = {}) {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > arc) continue;
      hitEnemy(enemy, damage, angle, push, color, options);
      if (options.bleedChance > 0 && nextRandom('encounter') < options.bleedChance) {
        applyBleed(enemy, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
      }
      if (options.itemBleedChance > 0 && nextRandom('encounter') < options.itemBleedChance) {
        applyBleed(enemy, 1, 5);
      }
    }

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const potAssist = prop.kind === 'pot';
      const reachBonus = potAssist ? 24 : 10;
      const arcBonus = potAssist ? 0.4 : 0.2;
      const touchingBonus = potAssist ? 30 : 18;
      const propDistance = dist(player.x, player.y, prop.x, prop.y);
      if (propDistance > range + prop.r + reachBonus) return;
      if (potAssist && propDistance <= range + prop.r + 26) {
        damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= player.r + prop.r + touchingBonus;
      if (!touching && difference > arc + arcBonus) return;
      damageDestructible(prop, 1);
    });
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    if (player.weaponCooldown > 0) return false;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const attackSpeed = getAttackSpeedValue();
    const itemStats = getItemStats();
    const wDmg  = k => Math.max(1, (WEAPON_BASE_STATS[k]?.damage  ?? 0) + getAnvilWeaponBonus(k, 'damage'));
    const wKnk  = k => Math.max(0, (WEAPON_BASE_STATS[k]?.knockback ?? 0) + getAnvilWeaponBonus(k, 'knockback'));
    const wRng  = k => Math.max(10, (WEAPON_BASE_STATS[k]?.range   ?? 120) + getAnvilWeaponBonus(k, 'range'));
    const wCd   = k => getWeaponBaseCooldown(k);
    if (weaponKey === 'extending_staff') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), 1.45, wKnk(weaponKey), '#eaf4ff');
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'hunters_bow') {
      spawnWeaponProjectile({ angle, speed: 820, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 4, life: 0.9, kind: 'hunters_bow', color: '#f0fbff', pierceCount: 1, hitOptions: { critBonus: 0.1 } });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'thorns_bleed_blade') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), ATTACKS.melee.arc, wKnk(weaponKey), '#ff6e8b', { bleedChance: 0.10, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'lazer_glasses') {
      player.weaponBeamTime = 0.65;
      player.weaponBeamTick = 0;
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'metao_fire_staff') {
      spawnFireballs();
      player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'magenta_degale') {
      spawnWeaponProjectile({ angle, speed: 920, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 7, life: 0.9, kind: 'magenta_degale', color: '#ff8bd2' });
      player.vx -= Math.cos(angle) * 280;
      player.vy -= Math.sin(angle) * 280;
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'magenta_p90') {
      for (let shot = 0; shot < 5; shot += 1) {
        weaponBurstQueue.push({
          delay: shot * 0.04,
          angle: angle + rand(0.05, -0.05, 'encounter'),
          weaponKey,
        });
      }
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'granillia_lightning_spear') {
      castSmiteChain();
      player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'excalibur') {
      const excaliburDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 7.77 + getAnvilWeaponBonus(weaponKey, 'damage')));
      fireWeaponSweep(excaliburDamage, wRng(weaponKey), Math.PI, wKnk(weaponKey), '#ffe291', { rawDamage: true });
      particles.push({ x: player.x, y: player.y, life: 0.6, ring: 56, c: '#ffd26a' });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), ATTACKS.melee.arc, wKnk(weaponKey), '#ffe8a0');
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'void_piercer') {
      spawnWeaponProjectile({ angle, speed: 760, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 6, life: 1.2, kind: 'void_piercer', color: '#ffd2c0', pierceCount: 4, hitOptions: { ignoreBarrier: true, critBonus: 0.2 } });
      player.weaponCooldown = wCd(weaponKey);
      return true;
    }
    if (weaponKey === 'aegis_shield_weapon') {
      player.blockActive = true;
      player.blockTimer = 2;
      player.weaponCooldown = wCd(weaponKey);
      particles.push({ x: player.x, y: player.y, life: 0.5, ring: 26, c: '#9ae9ff' });
      return true;
    }
    return false;
  }

  function tryMelee() {
    cancelCowardsWayOnAttack();
    if (getEquippedWeapon()) {
      tryWeaponAttack();
      return;
    }
    const move = getEquippedMove('melee');
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    if (!spendSkillCharge('melee', getMeleeCooldownDuration(move, attackSpeed))) return;
    if (move === 'fire_balls') {
      spawnFireballs();
      return;
    }
    if (move === 'narwal_fight') {
      castNarwalFight();
      return;
    }
    if (move === 'smite') {
      castSmiteChain();
      return;
    }
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    const anvilDmgBonus = getAnvilMoveBonus(move, 'damage');
    const anvilRngBonus = getAnvilMoveBonus(move, 'range');
    const damage = (godTimer > 0 ? 56 : ATTACKS.melee.damage) + anvilDmgBonus;
    const meleeRange = ATTACKS.melee.range + anvilRngBonus;
    const meleeKnockback = move === 'slash' ? SLASH_KNOCKBACK : ATTACKS.melee.push;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > meleeRange + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc) continue;
      hitEnemy(enemy, damage, angle, meleeKnockback, '#0ff');
      const slashBleedChance = move === 'slash' ? 0.10 : 0;
      if (slashBleedChance > 0 && rng() < slashBleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.bleedChance > 0 && rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const slashPotAssist = move === 'slash' && prop.kind === 'pot';
      const destructibleReachBonus = slashPotAssist ? 24 : 8;
      const destructibleArcBonus = slashPotAssist ? 0.45 : 0.25;
      const touchingBonus = slashPotAssist ? 32 : 18;
      const propDistance = dist(player.x, player.y, prop.x, prop.y);
      if (propDistance > meleeRange + prop.r + destructibleReachBonus) return;
      if (slashPotAssist && propDistance <= meleeRange + prop.r + 24) {
        damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= player.r + prop.r + touchingBonus;
      if (!touching && difference > ATTACKS.melee.arc + destructibleArcBonus) return;
      damageDestructible(prop, 1);
    });
  }

  function fireLazerGlassesTick() {
    const baseAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    [-0.2, 0.2].forEach(offset => {
      const angle = baseAngle + offset;
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, 430, LAZER_GLASSES_BOUNCES);
      let target = null;
      let hitSegment = null;
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = enemies[index];
        if (!enemy) continue;
        hitSegment = beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + 4);
        if (hitSegment) {
          target = enemy;
          break;
        }
      }
      if (target) {
        hitEnemy(target, 9, hitSegment?.angle ?? angle, 80, '#cda8ff', { fireChance: 0.05, fireStacks: 1, fireDuration: 3 });
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamPathHitsDestructible(beamPath, prop, 4)) {
          damageDestructible(prop, 1);
        }
      });
    });
  }

  function updateWeaponSystems(dt) {
    player.weaponCooldown = Math.max(0, Number(player.weaponCooldown || 0) - dt);
    if (player.blockTimer > 0) {
      player.blockTimer = Math.max(0, player.blockTimer - dt);
      player.blockActive = player.blockTimer > 0;
      if (player.blockActive && nextRandom('fx') < 0.25) {
        particles.push({ x: player.x + rand(18, -18, 'fx'), y: player.y + rand(18, -18, 'fx'), life: 0.2, c: '#9cefff' });
      }
    } else {
      player.blockActive = false;
    }

    const equippedWeapon = getEquippedWeapon();
    if (equippedWeapon === 'golden_fleece') {
      player.fleeceTick += dt;
      if (player.fleeceTick >= 2) {
        player.fleeceTick = 0;
        const heal = player.maxHp * 0.2;
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (player.hp > before) spawnHealPopup(player.x + rand(-10, 10), player.y - 20, player.hp - before, { color: '#ffe59c' });
      }
    } else {
      player.fleeceTick = 0;
    }

    if (equippedWeapon === 'lazer_glasses' && player.weaponBeamTime > 0) {
      player.weaponBeamTime = Math.max(0, player.weaponBeamTime - dt);
      player.weaponBeamTick = Number(player.weaponBeamTick || 0) - dt;
      if (player.weaponBeamTick <= 0) {
        player.weaponBeamTick = 0.08;
        fireLazerGlassesTick();
      }
    }

    for (let index = weaponBurstQueue.length - 1; index >= 0; index -= 1) {
      const queued = weaponBurstQueue[index];
      queued.delay -= dt;
      if (queued.delay > 0) continue;
      if (queued.weaponKey === 'magenta_p90') {
        const p90Dmg = Math.max(1, (WEAPON_BASE_STATS.magenta_p90?.damage ?? 18) + getAnvilWeaponBonus('magenta_p90', 'damage'));
        const p90Knk = Math.max(0, (WEAPON_BASE_STATS.magenta_p90?.knockback ?? 140) + getAnvilWeaponBonus('magenta_p90', 'knockback'));
        spawnWeaponProjectile({ angle: queued.angle, speed: 900, damage: p90Dmg, knockback: p90Knk, r: 4, life: 0.8, kind: 'magenta_p90', color: '#ff9dd7' });
        player.vx -= Math.cos(queued.angle) * 55;
        player.vy -= Math.sin(queued.angle) * 55;
      }
      weaponBurstQueue.splice(index, 1);
    }
  }

  function tryLaser() {
    cancelCowardsWayOnAttack();
    if (laserActive) return;
    const attackSpeed = getAttackSpeedValue();
    const move = getEquippedMove('laser');
    const rechargeTime = getLaserCooldownDuration(move, attackSpeed);
    if (move === 'turtle_wave') {
      if (player.hp <= 1) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.52, text: 'NEED HP', c: '#ff8b98' });
        return;
      }
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'turtle_wave';
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      return;
    }
    if (move === 'power_disks') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      spawnPlayerDiskBurst();
      return;
    }
    if (move === 'blade_justice') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      castBladeOfJustice();
      return;
    }
    if (move === 'love_beam') {
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'beam';
      loveBeamCasting = true;
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      return;
    }
    if (move === 'lightning_columns') {
      if (!spendSkillCharge('laser', rechargeTime)) return;
      castLightningColumns();
      return;
    }
    if (move === 'god_sweep') {
      if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      laserActive = true;
      laserMode = 'god_sweep';
      laserTime = getLaserCastDuration(move);
      laserTick = 0;
      turtleWaveHpTimer = 0;
      laserAngle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      laserSweepSpeed = (nextRandom('encounter') < 0.5 ? -1 : 1) * 4.6;
      return;
    }
    if (!spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
    laserActive = true;
    laserMode = 'beam';
    laserTime = getLaserCastDuration(move);
    laserTick = 0;
    turtleWaveHpTimer = 0;
  }

  function endActiveLaser() {
    if (!laserActive) return;
    laserActive = false;
    laserMode = 'beam';
    loveBeamCasting = false;
    turtleWaveHpTimer = 0;
    queueHeldSkillRecharge('laser', getLaserCooldownDuration(getEquippedMove('laser'), getAttackSpeedValue()));
  }

  function tickTurtleWaveHpDrain(dt) {
    if (laserMode !== 'turtle_wave') return false;
    turtleWaveHpTimer += dt;
    while (turtleWaveHpTimer >= 1) {
      turtleWaveHpTimer -= 1;
      const drain = Math.min(TURTLE_WAVE_HP_PER_SECOND, Math.max(0, player.hp - 1));
      if (drain <= 0) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
      player.hp = Math.max(1, player.hp - drain);
      if (!isBossFightActive()) player.roomDamageTaken = (player.roomDamageTaken || 0) + drain;
      spawnDamagePopup(player.x, player.y - 18, drain, { color: '#74f5ff', size: 14 });
      particles.push({ x: player.x, y: player.y - 30, life: 0.42, text: `-${drain} HP`, c: '#74f5ff' });
      if (player.hp <= 1) {
        particles.push({ x: player.x, y: player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
    }
    return false;
  }

  function updatePlayerLaser(dt) {
    if (!laserActive) return;
    laserTime -= dt;
    laserTick -= dt;
    if (tickTurtleWaveHpDrain(dt)) {
      endActiveLaser();
      return;
    }
    const move = getEquippedMove('laser');
    const itemStats = getItemStats();
    const loveBeamActive = loveBeamCasting && move === 'love_beam';
    const angle = laserMode === 'god_sweep'
      ? laserAngle
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    if (laserTick <= 0) {
      if (laserMode === 'god_sweep') laserAngle += laserSweepSpeed * 0.05;
      laserTick = laserMode === 'god_sweep' ? 0.05 : laserMode === 'turtle_wave' ? 0.08 : loveBeamActive ? 0.06 : ATTACKS.laser.tick;
      const range = getPlayerBeamRange(laserMode, move);
      const beamPath = buildRicochetBeamPath(player.x, player.y, angle, range, getPlayerBeamBounceCount(laserMode));
      let loveBeamHits = 0;
      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        if (!enemy) continue;
        const hitSegment = beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + (laserMode === 'turtle_wave' ? 14 : 6));
        if (!hitSegment) continue;
        const anvilBeamBonus = getAnvilMoveBonus(move, 'damage');
        const baseBeamDamage = laserMode === 'god_sweep'
          ? 12
          : laserMode === 'turtle_wave'
            ? 34
            : loveBeamActive
              ? 18
              : godTimer > 0
                ? 16
                : ATTACKS.laser.damage;
        const beamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1);
        const anvilCritBonus = getAnvilMoveBonus(move, 'critChance');
        hitEnemy(enemy, beamDamage, hitSegment.angle, laserMode === 'god_sweep' ? 120 : laserMode === 'turtle_wave' ? 155 : loveBeamActive ? 52 : 60, loveBeamActive ? '#ff9ed6' : '#f0f', anvilCritBonus > 0 ? { critBonus: anvilCritBonus } : {});
        chainBeamHit(enemy, beamDamage, hitSegment.angle, loveBeamActive ? '#ffb8e0' : '#d890ff');
        if (loveBeamActive) loveBeamHits += 1;
        if (move === 'blood_beam' && rng() < 0.05) applyBleed(enemy, 1, 3.2);
        if (move === 'blood_beam' && rng() < 0.08) applyDarkDrain(enemy, 1, 3.4);
      }
      destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && beamPathHitsDestructible(beamPath, prop, 4)) {
          damageDestructible(prop, 1);
        }
      });
      if (loveBeamHits > 0) {
        const heal = Math.min(8, loveBeamHits * 1.25);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        spawnHealPopup(player.x + rand(-6, 6), player.y - 22, heal, { color: '#ff9ed6' });
        particles.push({ x: player.x, y: player.y - 26, life: 0.22, text: 'LOVE', c: '#ff9ed6' });
      }
    }
    if (laserTime <= 0) {
      endActiveLaser();
    }
  }

  function trySmash() {
    cancelCowardsWayOnAttack();
    const itemStats = getItemStats();
    const attackSpeed = getAttackSpeedValue();
    if (!spendSkillCharge('smash', getSmashCooldownDuration(attackSpeed))) return;
    const move = getEquippedMove('smash');
    if (move === 'kicky_kick') {
      castKickyKick();
      return;
    }
    if (move === 'chaos_burst') {
      castChaosBurst();
      return;
    }
    if (move === 'healing_zone') {
      castHealingZone();
      return;
    }
    if (move === 'fire_circle') {
      castFireCircle();
      return;
    }
    if (move === 'floor_lava') {
      castFloorLava();
      return;
    }
    const anvilSmashRange = getAnvilMoveBonus(move, 'range');
    const smashRadius = (ATTACKS.smash.radius + anvilSmashRange) * (itemStats.aoeRadiusMultiplier || 1);
    shake = 16;
    shakeT = 0.24;
    particles.push({ x: player.x, y: player.y, life: 0.4, ring: smashRadius - 30, c: '#ff00aa' });
    spawnAoeShockwave(player.x, player.y, smashRadius, '#ff66cc', 'heavy');
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > smashRadius + enemy.r) continue;
      const angle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      let damage = (godTimer > 0 ? 82 : ATTACKS.smash.damage) + getAnvilMoveBonus(move, 'damage');
      if (itemStats.bleedDamageMultiplier > 1 && getStatusStacks(enemy, 'bleed') > 0) {
        damage += ATTACKS.smash.bonus;
        particles.push({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, '#ff66cc');
      enemy.stun = 0.5;
    }
    destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && dist(player.x, player.y, prop.x, prop.y) <= smashRadius + prop.r) {
      damageDestructible(prop, 2);
      }
    });
  }

  function tryDash(moveX, moveY) {
    if (player.dashTime > 0) return;
    const move = getEquippedMove('dash');
    const attackSpeed = getAttackSpeedValue();
    const rechargeTime = getDashCooldownDuration(move, attackSpeed);
    if (!spendSkillCharge('dash', rechargeTime)) return;
    if (move === 'flying_unhitable') {
      castFlyingUntouchable();
      return;
    }
    if (move === 'warp') {
      castWarp();
      return;
    }
    if (move === 'zip_lightning') {
      castZipLightning(moveX, moveY);
      return;
    }
    if (move === 'cowards_way') {
      castCowardsWay();
      return;
    }
    if (move === 'nimrod_stomp') {
      castNimrodStomp(moveX, moveY);
      return;
    }
    castDashBurst(moveX, moveY);
  }

  function castDashBurst(moveX, moveY) {
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const dashSpeed = (520 + player.attackSpeed * 28) * (godTimer > 0 ? 1.1 : 1);
    player.dashTime = 0.16;
    player.dashX = Math.cos(angle) * dashSpeed;
    player.dashY = Math.sin(angle) * dashSpeed;
    player.vx = player.dashX;
    player.vy = player.dashY;
    player.inv = Math.max(player.inv, 0.18);
    shake = Math.max(shake, 3);
    shakeT = Math.max(shakeT, 0.08);
    particles.push({ x: player.x, y: player.y, life: 0.28, ring: 18, c: '#fff06a' });
  }

  function cancelCowardsWayOnAttack() {
    if (player.cowardsWayTime <= 0) return;
    player.cowardsWayTime = 0;
    particles.push({ x: player.x, y: player.y - 20, life: 0.42, text: "COWARD'S WAY BROKEN", c: '#ffd27a' });
  }

  function findSafePointNearTarget(tx, ty, radius = player.r, maxRadius = 220, step = 22) {
    const clampedX = clamp(tx, WALL + radius + 2, ROOM_W - WALL - radius - 2);
    const clampedY = clamp(ty, WALL + radius + 2, ROOM_H - WALL - radius - 2);
    if (!isBlocked(clampedX, clampedY, radius)) return { x: clampedX, y: clampedY };
    for (let distStep = step; distStep <= maxRadius; distStep += step) {
      const checks = Math.max(8, Math.floor((Math.PI * 2 * distStep) / step));
      for (let index = 0; index < checks; index += 1) {
        const angle = (index / checks) * Math.PI * 2;
        const px = clamp(clampedX + Math.cos(angle) * distStep, WALL + radius + 2, ROOM_W - WALL - radius - 2);
        const py = clamp(clampedY + Math.sin(angle) * distStep, WALL + radius + 2, ROOM_H - WALL - radius - 2);
        if (!isBlocked(px, py, radius)) return { x: px, y: py };
      }
    }
    return null;
  }

  function teleportPlayerTo(targetX, targetY, color = '#b99cff') {
    particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: color });
    player.x = targetX;
    player.y = targetY;
    player.vx = 0;
    player.vy = 0;
    particles.push({ x: player.x, y: player.y, life: 0.35, ring: 18, c: color });
  }

  function castNimrodStomp(moveX, moveY) {
    const itemStats = getItemStats();
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
    const edgePad = WALL + player.r + 4;
    const targetX = horizontal
      ? (Math.cos(angle) >= 0 ? ROOM_W - edgePad : edgePad)
      : player.x;
    const targetY = horizontal
      ? clamp(mouse.worldY, edgePad, ROOM_H - edgePad)
      : (Math.sin(angle) >= 0 ? ROOM_H - edgePad : edgePad);
    const landingPoint = findSafePointNearTarget(targetX, targetY, player.r, 260, 24)
      || findSafePointNearTarget(player.x + Math.cos(angle) * 240, player.y + Math.sin(angle) * 240, player.r, 140, 20);
    if (!landingPoint) return;
    teleportPlayerTo(landingPoint.x, landingPoint.y, '#fff06a');
    const aoeRadius = 108 * (itemStats.aoeRadiusMultiplier || 1);
    const stompDamage = godTimer > 0 ? 64 : 46;
    blastRadius(player.x, player.y, aoeRadius, stompDamage, '#ffe67a');
    shake = Math.max(shake, 14);
    shakeT = Math.max(shakeT, 0.22);
    player.inv = Math.max(player.inv, 0.32);
    particles.push({ x: player.x, y: player.y, life: 0.44, ring: aoeRadius, c: '#ffe67a' });
  }

  function castCowardsWay() {
    player.cowardsWayTime = 3;
    player.inv = Math.max(player.inv, 0.25);
    particles.push({ x: player.x, y: player.y - 18, life: 0.72, text: "COWARD'S WAY", c: '#8dffcf' });
  }

  function castZipLightning(moveX, moveY) {
    const itemStats = getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = godTimer > 0 ? 34 : 26;
    let sourceX = player.x;
    let sourceY = player.y;
    let performedHop = false;
    for (let hop = 0; hop < hops; hop += 1) {
      const searchX = hop === 0 ? mouse.worldX : sourceX;
      const searchY = hop === 0 ? mouse.worldY : sourceY;
      const target = findNearestEnemy(searchX, searchY, hop === 0 ? 280 : 260, visited)
        || findNearestEnemy(sourceX, sourceY, 260, visited);
      if (!target) break;
      visited.add(target);
      const toward = Math.atan2(target.y - sourceY, target.x - sourceX);
      const landDist = target.r + player.r + 8;
      const landing = findSafePointNearTarget(
        target.x - Math.cos(toward) * landDist,
        target.y - Math.sin(toward) * landDist,
        player.r,
        90,
        14
      );
      if (landing) teleportPlayerTo(landing.x, landing.y, '#95deff');
      sourceX = player.x;
      sourceY = player.y;
      performedHop = true;

      const hitAngle = Math.atan2(target.y - player.y, target.x - player.x);
      hitEnemy(target, baseDamage, hitAngle, 185, '#95deff');

      const chained = new Set([target]);
      let chainSource = target;
      for (let chainIndex = 0; chainIndex < 2; chainIndex += 1) {
        const chainedEnemy = findNearestEnemy(chainSource.x, chainSource.y, 156, chained);
        if (!chainedEnemy) break;
        chained.add(chainedEnemy);
        const chainDamage = Math.max(1, Math.round(baseDamage * (0.72 - chainIndex * 0.1)));
        hitEnemy(
          chainedEnemy,
          chainDamage,
          Math.atan2(chainedEnemy.y - chainSource.y, chainedEnemy.x - chainSource.x),
          120,
          '#9adfff',
          { rawDamage: true }
        );
        particles.push({ x: (chainSource.x + chainedEnemy.x) * 0.5, y: (chainSource.y + chainedEnemy.y) * 0.5, life: 0.2, c: '#9adfff' });
        chainSource = chainedEnemy;
      }
      particles.push({ x: player.x, y: player.y, life: 0.22, ring: 16 + hop * 4, c: '#84cfff' });
    }

    if (!performedHop) {
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
      const fallback = findSafePointNearTarget(player.x + Math.cos(angle) * 190, player.y + Math.sin(angle) * 190, player.r, 120, 16);
      if (fallback) teleportPlayerTo(fallback.x, fallback.y, '#95deff');
    }

    shake = Math.max(shake, 8);
    shakeT = Math.max(shakeT, 0.14);
    player.inv = Math.max(player.inv, 0.26);
    const zipShock = 72 * (itemStats.aoeRadiusMultiplier || 1);
    particles.push({ x: player.x, y: player.y, life: 0.24, ring: zipShock, c: '#8ad9ff' });
  }

  function castNarwalFight() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    fireWeaponSweep(40, 136, 1.45, 280, '#ff8ed0');
    spawnWeaponProjectile({
      x: player.x + Math.cos(angle) * 22,
      y: player.y + Math.sin(angle) * 22,
      angle,
      speed: 760,
      damage: 26,
      knockback: 200,
      r: 6,
      life: 0.92,
      kind: 'narwal_fight',
      color: '#ffd1ea',
      pierceCount: 2,
      hitOptions: { critBonus: 0.08 },
    });
    particles.push({ x: player.x, y: player.y, life: 0.32, ring: 22, c: '#ff8ed0' });
  }

  function castKickyKick() {
    const itemStats = getItemStats();
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const radius = 138 * (itemStats.aoeRadiusMultiplier || 1);
    const kickDamage = 92;
    const kickKnockback = 720;
    blastRadius(player.x, player.y, radius, kickDamage, '#ff7fc2');
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (dist(player.x, player.y, enemy.x, enemy.y) > radius + enemy.r) return;
      const enemyAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      enemy.vx += Math.cos(enemyAngle) * kickKnockback;
      enemy.vy += Math.sin(enemyAngle) * kickKnockback;
      enemy.stun = Math.max(enemy.stun, 0.7);
    });
    player.vx -= Math.cos(angle) * 260;
    player.vy -= Math.sin(angle) * 260;
    shake = Math.max(shake, 10);
    shakeT = Math.max(shakeT, 0.18);
    particles.push({ x: player.x, y: player.y, life: 0.42, ring: radius * 0.85, c: '#ff7fc2' });
  }

  function castFlyingUntouchable() {
    player.princessFlightTime = 15;
    player.inv = Math.max(player.inv, 15);
    player.vx = 0;
    player.vy = 0;
    particles.push({ x: player.x, y: player.y - 18, life: 0.8, text: 'FLY HIGH', c: '#ffd1ea' });
  }

  function applyResponsiveVelocity(current, desired, dt) {
    const isStopping = Math.abs(desired) < 0.001;
    const isTurning = !isStopping && current !== 0 && Math.sign(current) !== Math.sign(desired);
    const response = isStopping ? 20 : isTurning ? 24 : 14;
    const next = current + (desired - current) * Math.min(1, response * dt);
    return Math.abs(next) < 4 ? 0 : next;
  }

  function spawnPlayerDiskBurst() {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * (Math.PI * 2 / 8);
      const isMetao = player?.character === 'metao';
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, r: 7, life: 1.2, enemy: false, kind: 'disk', damage: 20, hitOptions: isMetao ? { fireChance: 0.4, fireStacks: 1, fireDuration: 3 } : {} });
    }
  }

  function spawnFireballs() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 320, vy: Math.sin(angle) * 320, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 * aoeRadiusMultiplier, fireStacks: 2, fireDuration: 3.4 });
    }
  }

  function castChaosBurst() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const isMetao = player?.character === 'metao';
    for (let index = 0; index < 6; index += 1) {
      const angle = rng() * Math.PI * 2;
      const px = player.x + Math.cos(angle) * rand(160, 40);
      const py = player.y + Math.sin(angle) * rand(160, 40);
      particles.push({ x: px, y: py, life: 0.45, ring: 18 * aoeRadiusMultiplier, c: '#c971ff' });
      blastRadius(px, py, 52 * aoeRadiusMultiplier, 24, '#c971ff');
      applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'poison', 1, 4.8);
      if (isMetao) applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'fire', 1, 3.5);
    }
  }

  function castBladeOfJustice() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > 110 + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) continue;
      hitEnemy(enemy, 34, angle, 280, '#fff6a3');
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (dist(player.x, player.y, prop.x, prop.y) > 110 + prop.r) return;
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) return;
      damageDestructible(prop, 2);
    });
    particles.push({ x: player.x, y: player.y, life: 0.5, ring: 36, c: '#fff6a3' });
  }

  function castSmiteChain() {
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    player.swing = ATTACKS.melee.active;
    player.swingA = angle;

    // Physical swing: hits enemies and destructibles in an arc.
    const physicalDamage = 20;
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      const enemy = enemies[index];
      if (!enemy) continue;
      const distance = dist(player.x, player.y, enemy.x, enemy.y);
      if (distance > ATTACKS.melee.range + enemy.r + 4) continue;
      const targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) continue;
      hitEnemy(enemy, physicalDamage, angle, ATTACKS.melee.push, '#fff6a3');
    }
    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const distance = dist(player.x, player.y, prop.x, prop.y);
      if (distance > ATTACKS.melee.range + prop.r + 4) return;
      const targetAngle = Math.atan2(prop.y - player.y, prop.x - player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > ATTACKS.melee.arc + 0.15) return;
      damageDestructible(prop, 2);
    });

    const origin = findNearestSmiteTarget(player.x, player.y, 280);
    if (!origin) return;

    let current = origin;
    let fromX = player.x;
    let fromY = player.y;
    const hit = new Set();
    for (let jumps = 0; jumps < 5 && current; jumps += 1) {
      hit.add(current.ref);
      const strikeDamage = 18 + jumps * 4;
      if (current.type === 'enemy') {
        hitEnemy(current.ref, strikeDamage, Math.atan2(current.y - fromY, current.x - fromX), 90, '#dfe8ff');
      } else {
        damageDestructible(current.ref, Math.max(2, Math.round(strikeDamage / 10)));
      }
      particles.push({ x: current.x, y: current.y, life: 0.32, ring: 18 + jumps * 3, c: '#cfdcff' });
      particles.push({
        life: 0.24,
        c: '#eaf2ff',
        line: {
          x1: fromX,
          y1: fromY,
          x2: current.x,
          y2: current.y,
          w: 4.5 + jumps * 0.7,
          jag: 14 + jumps * 1.4,
          seg: 7,
          phase: rng() * Math.PI * 2,
        },
      });
      fromX = current.x;
      fromY = current.y;
      current = findNearestSmiteTarget(fromX, fromY, 170, hit);
    }
  }

  function findNearestSmiteTarget(x, y, radius, exclude = new Set()) {
    let best = null;
    let bestDist = radius;

    enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = { type: 'enemy', ref: enemy, x: enemy.x, y: enemy.y, r: enemy.r };
        bestDist = d;
      }
    });

    destructibles.forEach(prop => {
      if (prop.broken || prop.hidden || exclude.has(prop)) return;
      const d = dist(x, y, prop.x, prop.y);
      if (d < bestDist) {
        best = { type: 'prop', ref: prop, x: prop.x, y: prop.y, r: prop.r };
        bestDist = d;
      }
    });

    return best;
  }

  function castHealingZone() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    hazards.push({ kind: 'healing_zone', x: player.x, y: player.y, r: 62 * aoeRadiusMultiplier, ttl: 6, healTick: 0.24, healAccum: 0, plusTick: 0.08 });
    particles.push({ x: player.x, y: player.y, life: 0.7, ring: 30, c: '#35ff6f' });
  }

  function castFireCircle() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    hazards.push({ kind: 'fire_circle', x: player.x, y: player.y, r: 96 * aoeRadiusMultiplier, ttl: 5.2, dps: 18, followPlayer: true });
    particles.push({ x: player.x, y: player.y, life: 0.55, ring: 34, c: '#ff7b32' });
  }

  function castFloorLava() {
    player.lavaWalkTime = 5.8;
    player.lavaTrailTick = 0;
    particles.push({ x: player.x, y: player.y - 12, life: 0.7, text: 'LAVA WALK', c: '#ff9f40' });
  }

  function castLightningColumns() {
    const aoeRadiusMultiplier = getItemStats().aoeRadiusMultiplier || 1;
    const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
    const offsets = [-42, 42];
    offsets.forEach(offset => {
      const ox = Math.cos(angle + Math.PI / 2) * offset;
      const oy = Math.sin(angle + Math.PI / 2) * offset;
      hazards.push({
        kind: 'lightning_column',
        x: mouse.worldX + ox,
        y: mouse.worldY + oy,
        r: 54 * aoeRadiusMultiplier,
        ttl: 4.5,
        tick: 0,
        interval: 0.45,
        damage: 18,
      });
      particles.push({ x: mouse.worldX + ox, y: mouse.worldY + oy, life: 0.45, ring: 24, c: '#8dd4ff' });
    });
  }

  function castWarp() {
    const tx = clamp(mouse.worldX, WALL + player.r + 2, ROOM_W - WALL - player.r - 2);
    const ty = clamp(mouse.worldY, WALL + player.r + 2, ROOM_H - WALL - player.r - 2);
    const safePoint = findSafePointNearTarget(tx, ty, player.r, 210, 18);
    if (!safePoint) return;
    teleportPlayerTo(safePoint.x, safePoint.y, '#b99cff');
    player.inv = Math.max(player.inv, 0.24);
  }

  function applyEnemyImpactStun(enemy, dealt, appliedKnockback) {
    const maxHealth = Number(enemy?.max) || 0;
    const stunResistance = Math.max(0, Number(enemy?.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, HEAVY_KNOCKBACK_STUN + clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    stunDuration *= durationMultiplier;
    if (BOSS_TYPES.has(enemy.type)) stunDuration *= HEAVY_IMPACT_BOSS_STUN_MULTIPLIER;
    enemy.stun = Math.max(enemy.stun || 0, stunDuration);
    particles.push({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    particles.push({ x: enemy.x, y: enemy.y, life: 0.36, ring: enemy.r + 18, c: '#ffe66d' });
    return true;
  }

  function applyPlayerImpactStun(dealt, appliedKnockback) {
    if (!player) return false;
    const stats = getItemStats();
    const stunResistance = Math.max(0, Number(stats.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const maxHealth = Number(player.maxHp) || 0;
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, HEAVY_KNOCKBACK_STUN + clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    player.stun = Math.max(Number(player.stun || 0), stunDuration * durationMultiplier);
    particles.push({ x: player.x, y: player.y - player.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    particles.push({ x: player.x, y: player.y, life: 0.36, ring: player.r + 18, c: '#ffe66d' });
    return true;
  }

  function hitEnemy(enemy, damage, angle, knockback, color, options = {}) {
    if ((enemy?.inv || 0) > 0) return;
    const stats = getItemStats();
    const sandbox = getActiveSandboxSettings();
    const critChance = clamp((stats.critChance || 0) + Number(options.critBonus || 0), 0, 0.98);
    let dealt = options.rawDamage ? Math.max(1, Math.round(damage)) : scaleDamageAgainstEnemy(enemy, damage);
    if (sandbox) dealt = Math.max(1, Math.round(dealt * sandbox.playerDamageMultiplier));
    const isCrit = critChance > 0 && nextRandom('encounter') < critChance;
    const appliedKnockback = knockback * (stats.knockbackMultiplier || 1);
    if (isCrit) dealt = Math.round(dealt * stats.critMultiplier);
    if (!options.ignoreBarrier && (enemy.barrier || 0) > 0) {
      const absorbed = Math.min(enemy.barrier, dealt);
      enemy.barrier -= absorbed;
      dealt -= absorbed;
      particles.push({ x: enemy.x, y: enemy.y - 20, life: 0.4, text: `BLOCK ${absorbed}`, c: '#7ed6ff' });
      if (dealt <= 0) {
        enemy.vx += Math.cos(angle) * appliedKnockback * 0.35;
        enemy.vy += Math.sin(angle) * appliedKnockback * 0.35;
        enemy.stun = Math.max(enemy.stun, 0.04);
        applyEnemyImpactStun(enemy, 0, appliedKnockback * 0.35);
        return;
      }
    }
    enemy.hp -= dealt;
    enemy.vx += Math.cos(angle) * appliedKnockback;
    enemy.vy += Math.sin(angle) * appliedKnockback;
    enemy.stun = Math.max(enemy.stun, 0.08);
    applyEnemyImpactStun(enemy, dealt, appliedKnockback);
    if (!options.noCharmBuff) grantCritCharmBuff();
    particles.push({ x: enemy.x, y: enemy.y, life: 0.24, vx: rand(-30, 30, 'fx'), vy: rand(-30, 30, 'fx'), c: color });
    spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      color: isCrit ? '#ff9f1c' : '#ff6b6b',
      size: isCrit ? 20 : 16,
    });
    achievementEvents.emit('damage:dealt', { amount: dealt });
    if (options.fireChance > 0 && nextRandom('encounter') < options.fireChance) {
      applyFire(enemy, Number(options.fireStacks || 1), Number(options.fireDuration || 2.8));
    }
    if (options.chainLightningRadius > 0) {
      const chained = findNearestEnemy(enemy.x, enemy.y, options.chainLightningRadius, new Set([enemy]));
      if (chained) {
        hitEnemy(
          chained,
          Math.max(1, Math.round(dealt * Number(options.chainMultiplier || 0.6))),
          Math.atan2(chained.y - enemy.y, chained.x - enemy.x),
          Math.max(60, knockback * 0.5),
          '#9ad9ff',
          { noCharmBuff: true }
        );
      }
    }
    if (enemy.hp <= 0) onEnemyDie(enemy);
  }

  function chainBeamHit(primaryEnemy, baseDamage, angle, color) {
    const stats = getItemStats();
    const chains = stats.beamChainTargets || 0;
    if (chains <= 0) return;
    const visited = new Set([primaryEnemy]);
    let source = primaryEnemy;
    for (let index = 0; index < chains; index += 1) {
      const nextEnemy = findNearestEnemy(source.x, source.y, 145, visited);
      if (!nextEnemy) break;
      visited.add(nextEnemy);
      const chainDamage = Math.max(1, Math.round(baseDamage * (stats.beamChainDamageMultiplier || 0.6)));
      hitEnemy(nextEnemy, chainDamage, Math.atan2(nextEnemy.y - source.y, nextEnemy.x - source.x), 55, color);
      particles.push({ x: (source.x + nextEnemy.x) / 2, y: (source.y + nextEnemy.y) / 2, life: 0.22, c: '#d890ff' });
      source = nextEnemy;
    }
  }

  function applyBleed(enemy, stacks, duration) {
    if (!enemy) return;
    const beforeStacks = getStatusStacks(enemy, 'bleed');
    applyStatus(enemy, 'bleed', stacks, duration);
    const afterStacks = getStatusStacks(enemy, 'bleed');
    if (afterStacks > beforeStacks) {
      enemy.bleedFlash = 0.34;
      spawnBleedSpray(enemy, afterStacks - beforeStacks, 1.7);
    }
  }

  function applyFire(entity, stacks, duration) {
    applyStatus(entity, 'fire', stacks, duration);
  }

  function applyPoison(entity, stacks, duration) {
    applyStatus(entity, 'poison', stacks, duration);
  }

  function applyDarkDrain(entity, stacks, duration) {
    applyStatus(entity, 'dark_drain', stacks, duration);
  }

  function applyStatusInRadius(x, y, radius, statusKey, stacks, duration, sourceEnemy = null) {
    enemies.forEach(enemy => {
      if (!enemy) return;
      if (sourceEnemy && enemy === sourceEnemy) return;
      if (dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
      applyStatus(enemy, statusKey, stacks, duration);
    });
  }

  function spawnBleedSpray(enemy, stacks = 1, intensity = 1) {
    if (!enemy) return;
    const count = clamp(Math.ceil(Number(stacks || 1) * Number(intensity || 1)) + 1, 2, 9);
    const radius = Math.max(8, Number(enemy.r || 12));
    for (let index = 0; index < count; index += 1) {
      const angle = rand(Math.PI * 2, 0, 'fx');
      const force = rand(125, 35, 'fx') * (0.75 + Math.min(6, stacks) * 0.07);
      particles.push({
        x: enemy.x + Math.cos(angle) * rand(radius * 0.55, 1, 'fx'),
        y: enemy.y + Math.sin(angle) * rand(radius * 0.45, 1, 'fx'),
        life: rand(0.52, 0.22, 'fx'),
        vx: Math.cos(angle) * force + rand(24, -24, 'fx'),
        vy: Math.sin(angle) * force - rand(52, 12, 'fx'),
        c: BLEED_BLOOD_COLORS[irand(0, BLEED_BLOOD_COLORS.length - 1, 'fx')],
        blood: true,
        size: rand(4.2, 2.1, 'fx'),
      });
    }
  }

  function migrateEnemyState(enemy) {
    if (!enemy || typeof enemy !== 'object') return enemy;
    ensureStatuses(enemy);
    enemy.bleedImmune = !!enemy.bleedImmune;
    enemy.fireImmune = !!enemy.fireImmune;
    enemy.poisonImmune = !!enemy.poisonImmune;
    enemy.dark_drainImmune = !!enemy.dark_drainImmune;
    if (Number(enemy.bleed || 0) > 0 || Number(enemy.bleedT || 0) > 0) {
      applyBleed(enemy, Number(enemy.bleed || 0), Number(enemy.bleedT || 0));
      getStatusState(enemy, 'bleed').tick = Number(enemy.bleedTick || 0);
    }
    delete enemy.bleed;
    delete enemy.bleedT;
    delete enemy.bleedTick;
    return enemy;
  }

  function tickEnemyStatus(enemy, key, dt, config) {
    const state = getStatusState(enemy, key);
    if (state.stacks <= 0) return false;
    if (enemy[`${key}Immune`]) {
      clearStatus(enemy, key);
      return false;
    }
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = Math.max(1, Math.round(config.damage(state.stacks)));
      enemy.hp -= damage;
      spawnDamagePopup(enemy.x, enemy.y - 10, damage, { color: config.color, size: 15 });
      if (config.particleColor) {
        particles.push({ x: enemy.x + rand(-8, 8), y: enemy.y + rand(-8, 8), life: 0.25, c: config.particleColor });
      }
      if (key === 'bleed') spawnBleedSpray(enemy, state.stacks, 0.7);
      if (config.healScale > 0 && player && player.hp < player.maxHp) {
        const heal = damage * config.healScale;
        player.hp = Math.min(player.maxHp, player.hp + heal);
        if (heal > 0.2) spawnHealPopup(player.x + rand(-8, 8), player.y - 22, heal, { color: config.color });
      }
      if (enemy.hp <= 0) {
        onEnemyDie(enemy);
        return true;
      }
    }
    if (state.duration <= 0) clearStatus(enemy, key);
    return false;
  }

  function updateEnemyStatuses(enemy, dt) {
    if (enemy.bleedFlash > 0) enemy.bleedFlash = Math.max(0, enemy.bleedFlash - dt);
    const bleedStacks = getStatusStacks(enemy, 'bleed');
    if (tickEnemyStatus(enemy, 'bleed', dt, {
      interval: 0.5,
      damage: stacks => scaleBleedDamageAgainstEnemy(enemy, stacks),
      color: STATUS_STYLES.bleed.textColor,
      particleColor: STATUS_STYLES.bleed.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    if (tickEnemyStatus(enemy, 'fire', dt, {
      interval: 0.45,
      damage: stacks => scaleDamageAgainstEnemy(enemy, 1.5 + stacks * 1.8),
      color: STATUS_STYLES.fire.textColor,
      particleColor: STATUS_STYLES.fire.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    if (tickEnemyStatus(enemy, 'poison', dt, {
      interval: 0.7,
      damage: stacks => Math.max(1, enemy.max * (0.008 * stacks)),
      color: STATUS_STYLES.poison.textColor,
      particleColor: STATUS_STYLES.poison.color,
    })) return bleedStacks;
    if (!enemies.includes(enemy)) return bleedStacks;
    tickEnemyStatus(enemy, 'dark_drain', dt, {
      interval: 0.6,
      damage: stacks => scaleDamageAgainstEnemy(enemy, (1 + stacks * 2) * 0.1),
      color: STATUS_STYLES.dark_drain.textColor,
      particleColor: STATUS_STYLES.dark_drain.color,
      healScale: 0.35,
    });
    return bleedStacks;
  }

  function normalizeAngle(angle) {
    let result = angle;
    while (result <= -Math.PI) result += Math.PI * 2;
    while (result > Math.PI) result -= Math.PI * 2;
    return result;
  }

  function turnAngleToward(current, target, maxStep) {
    const delta = normalizeAngle(target - current);
    if (Math.abs(delta) <= maxStep) return target;
    return current + Math.sign(delta) * maxStep;
  }

  function rollEnemyBeamBias(enemy, maxError = 0.14) {
    if (!enemy) return 0;
    const bias = (nextRandom('encounter') - 0.5) * 2 * maxError;
    enemy.beamAimBias = bias;
    return bias;
  }

  function aimEnemyBeam(enemy, dt, turnRate) {
    if (!player || turnRate <= 0) return;
    const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + Number(enemy.beamAimBias || 0);
    enemy.beamAngle = turnAngleToward(enemy.beamAngle, targetAngle, turnRate * dt * 0.72);
  }

  function tickEnemyBeam(enemy, dt, config = {}) {
    const {
      tick = 0.1,
      range = 430,
      knockback = 130,
      damage = enemy.dmg,
      speedDamp = 0.84,
      turnRate = 0,
      onTick = null,
      onHit = null,
      onEnd = null,
    } = config;
    enemy.beamTime -= dt;
    enemy.beamTick -= dt;
    enemy.vx *= speedDamp;
    enemy.vy *= speedDamp;
    if (turnRate > 0) aimEnemyBeam(enemy, dt, turnRate * 0.55);
    if (typeof onTick === 'function') onTick(enemy, dt);
    if (enemy.beamTick <= 0) {
      enemy.beamTick = tick;
      const beamPath = buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, getEnemyBeamBounceCount(enemy));
      const hitSegment = beamPathHitsCircle(beamPath, player.x, player.y, player.r + 5);
      if (hitSegment) {
        damagePlayer(damage, hitSegment.angle, knockback, enemy.type === 'god' ? 'god_beam' : enemy.type === 'mirror_knight' ? 'mirror_beam' : 'enemy_beam');
        if (typeof onHit === 'function') onHit(enemy);
      }
    }
    if (enemy.beamTime <= 0) {
      enemy.beamAimBias = 0;
      if (typeof onEnd === 'function') onEnd(enemy);
      return true;
    }
    return false;
  }

  function spawnEnemyCorpse(enemy) {
    if (!enemy || enemy.type === 'boss_spawner') return;
    const speed = Math.min(150, Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0)));
    const direction = speed > 8
      ? Math.atan2(Number(enemy.vy || 0), Number(enemy.vx || 0))
      : rand(Math.PI * 2, 0, 'fx');
    const boss = isBossType(enemy.type);
    deadBodies.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(direction) * (22 + speed * 0.16),
      vy: Math.sin(direction) * (22 + speed * 0.16),
      r: enemy.r,
      spriteKey: getEnemySpriteKey(enemy),
      type: enemy.type,
      elite: !!enemy.elite,
      age: 0,
      fallTime: boss ? CORPSE_FALL_TIME * 1.35 : CORPSE_FALL_TIME,
      fadeStart: boss ? CORPSE_FADE_START * 1.8 : CORPSE_FADE_START,
      life: boss ? CORPSE_LIFETIME * 1.9 : CORPSE_LIFETIME,
      angle: direction + Math.PI / 2,
      fallAngle: rand(0.95, -0.95, 'fx') + (enemy.elite ? 0.25 : 0),
      face: getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || direction),
      size: Math.max(30, enemy.r * 2.4),
      bloodColor: enemy.type === 'god' ? '#f2ecff' : enemy.elite ? '#c04a14' : '#8d0018',
    });
  }

  function onEnemyDie(enemy) {
    if (enemy.type === 'god' && !enemy.rebirthUsed) {
      enemy.rebirthUsed = true;
      enemy.hp = Math.max(1, Math.round(enemy.max * 0.9));
      enemy.dmg = Math.round(enemy.dmg * 3);
      enemy.speed *= 1.18;
      triggerGodPhase(enemy, 2, 'DIVINE REBIRTH');
      playGodDialogue(2);
      spawnHealPopup(enemy.x, enemy.y - 54, enemy.hp, { color: '#79f7bf' });
      return;
    }

    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    const isTutorialDummy = !!enemy.tutorialDummy;
    spawnEnemyCorpse(enemy);
    if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;
    achievementEvents.emit('enemy:killed');
    if (player?.keenEyeReady) {
      triggerKeenEyeBuff();
      consumeCharge('keen_eye');
    }
    if (player?.chronoSpringReady) {
      triggerChronoSpringBuff();
      consumeCharge('chrono_spring');
    }

    const deathDust = enemy.elite ? 6 : isBossType(enemy.type) ? 9 : 4;
    for (let burst = 0; burst < deathDust; burst += 1) {
      const angle = rand(Math.PI * 2, 0, 'fx');
      particles.push({
        x: enemy.x + Math.cos(angle) * rand(enemy.r, 2, 'fx'),
        y: enemy.y + Math.sin(angle) * rand(enemy.r, 2, 'fx'),
        life: rand(0.34, 0.16, 'fx'),
        vx: Math.cos(angle) * rand(42, 12, 'fx'),
        vy: Math.sin(angle) * rand(42, 12, 'fx'),
        c: enemy.elite ? '#b97333' : enemy.type === 'god' ? '#f2ecff' : '#7b1a22',
      });
    }

    const enemyLootRandom = createRandomFromSeed(enemy.lootSeed || `${getFloorSeed()}|enemy:fallback:${enemy.type}:${Math.round(enemy.x)},${Math.round(enemy.y)}|loot`);
    if (isTutorialDummy) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
      particles.push({ x: enemy.x, y: enemy.y - 18, life: 0.85, text: 'RELIC DROPPED', c: '#8dd4ff' });
    } else {
      dropCoins(enemy.x, enemy.y, isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
      grantXp(isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
      incrementChargeProgress('insurance', 9);
      incrementChargeProgress('keen_eye', 10);
      incrementChargeProgress('chrono_spring', 7);
      incrementChargeProgress('escape', 10);
    }

    if (!isTutorialDummy && enemy.elite && enemyLootRandom() < 0.18) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemyLootRandom() < 0.1) {
      pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'god') {
      metaProgress.godsKilled = Number(metaProgress.godsKilled || 0) + 1;
      achievementEvents.emit('god:killed');
      if (!metaProgress.unlockedCharacters.includes('granialla')) metaProgress.unlockedCharacters.push('granialla');
      if (gameMode === 'boss_rush') {
        currentRoom.cleared = true;
        bossRushActive = false;
        onBossRushBossDefeated();
        return;
      }
      currentRoom.cleared = true;
      // After defeating god: offer the choice — cash in (win) or loop; Endless Descent adds a third option
      if (hasLegacy('endless_descent')) {
        pickups.push({ x: ROOM_W / 2 - 200, y: ROOM_H / 2, type: 'crown' });
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'descend' });
        pickups.push({ x: ROOM_W / 2 + 200, y: ROOM_H / 2, type: 'returnGate' });
      } else {
        pickups.push({ x: ROOM_W / 2 - 120, y: ROOM_H / 2, type: 'crown' });
        pickups.push({ x: ROOM_W / 2 + 120, y: ROOM_H / 2, type: 'returnGate' });
      }
      updateObjective();
      refreshMenuState();
      scheduleRunSave();
      return;
    }

    if (enemy.type === 'bulk_golem' && enemy.splitReady) {
      sayAtPosition(enemy.x, enemy.y, 'I AM NOT DONE.', { speaker: 'BULK GOLEM', tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
      const leftSpawn = findSafeEnemySpawnPoint(enemy.x - 70, enemy.y, 15);
      const rightSpawn = findSafeEnemySpawnPoint(enemy.x + 70, enemy.y, 15);
      if (leftSpawn) {
        const left = spawnEnemy('golem', leftSpawn.x, leftSpawn.y, false);
        left.spawnedFromBulk = true;
        left.hp = Math.round(left.max * 0.9);
        left.max = left.hp;
      }
      if (rightSpawn) {
        const right = spawnEnemy('golem', rightSpawn.x, rightSpawn.y, false);
        right.spawnedFromBulk = true;
        right.hp = Math.round(right.max * 0.9);
        right.max = right.hp;
      }
    }

    if (enemy.type === 'mirror_knight' && currentRoom?.type === 'challenge') {
      completeChallengeTrial('MIRROR BROKEN');
    }

    if (enemy.type === 'rival') {
      const rival = enemy.rivalData;
      if (rival) {
        rival.dead = true;
        if (player) player.rivalReputation = Math.max(0, Number(player.rivalReputation || 0)) + 1;
        achievementEvents.emit('rival:killed');
        rival.loot.forEach(item => {
          if (item.type === 'item' && item.key) {
            pickups.push({ x: enemy.x + rand(-22, 22, 'loot'), y: enemy.y + rand(-14, 14, 'loot'), type: 'item', key: item.key });
          } else if (item.type === 'potion') {
            pickups.push({ x: enemy.x + rand(-22, 22, 'loot'), y: enemy.y + rand(-14, 14, 'loot'), type: 'potion' });
          }
        });
        const rivalBase = 18 + floor * 4 + rival.loot.length * 8;
        const bonus = hasLegacy('rival_bounty') ? Math.round(rivalBase * 1.5) : rivalBase;
        dropCoins(enemy.x, enemy.y, bonus);
        particles.push({ x: enemy.x, y: enemy.y - 26, life: 2.0, text: `${rival.name.toUpperCase()} DEFEATED!`, c: rival.color });
        sayAtPosition(enemy.x, enemy.y, rival.deathLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
        grantXp(20 + floor * 3);
      }
      const rivalIdx = enemies.indexOf(enemy);
      if (rivalIdx >= 0) enemies.splice(rivalIdx, 1);
      if (player) player.kills = Math.max(0, Number(player.kills || 0)) + 1;
    }
    if (enemy.type === 'rival') return;

    if (enemies.filter(e => e.type !== 'rival').length === 0 && !currentRoom.cleared) {
      if (currentRoom.type === 'challenge') {
        updateObjective();
        return;
      }
      currentRoom.cleared = true;
      if ((currentRoom.type === 'ladder' || currentRoom.type === 'boss') && gameMode !== 'endless' && gameMode !== 'boss_rush') {
        pickups.push({ x: ROOM_W / 2, y: ROOM_H / 2, type: 'ladder' });
      }
      if (gameMode === 'endless' && endlessWaveActive) {
        endlessWaveActive = false;
        onEndlessWaveCleared();
      }
      if (gameMode === 'boss_rush' && bossRushActive) {
        bossRushActive = false;
        onBossRushBossDefeated();
      }
      updateObjective();
      scheduleRunSave();
    }
  }

  function onEndlessWaveCleared() {
    endlessWave += 1;
    if (ui.endlessWaveNum) ui.endlessWaveNum.textContent = endlessWave;
    const cx = ROOM_W / 2;
    const cy = ROOM_H / 2;
    const rewardRandom = createScopedRandom(`endless:wave:${endlessWave}:reward`);
    particles.push({ x: cx, y: cy - 40, life: 1.4, text: `WAVE ${endlessWave} CLEARED`, c: '#78d7ff' });
    pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: endlessWave % 3 === 0, random: rewardRandom }) });
    pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    if (endlessWave % 5 === 0) {
      pickups.push({ x: cx, y: cy + 50, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
    }
    dropCoins(cx, cy - 20, 30 + endlessWave * 8);
    grantXp(20 + endlessWave * 4);
    const delay = endlessWave <= 2 ? 4 : endlessWave <= 5 ? 3 : 2;
    setTimeout(() => {
      if (gameMode !== 'endless' || gameState !== 'play') return;
      currentRoom.cleared = false;
      endlessWaveActive = true;
      const waveSize = Math.min(4 + endlessWave + Math.floor(endlessWave / 3), 18);
      spawnWave(waveSize, 'combat');
      particles.push({ x: ROOM_W / 2, y: ROOM_H / 2 - 40, life: 1.1, text: `WAVE ${endlessWave + 1}`, c: '#ff8b8b' });
    }, delay * 1000);
  }

  function dropCoins(x, y, amount) {
    const scaledAmount = Math.max(1, Math.round(Number(amount || 0) * getRunDifficultyScalars().coinRewardMultiplier));
    const chunks = Math.max(1, Math.ceil(scaledAmount / 4));
    for (let index = 0; index < chunks; index += 1) {
      pickups.push({
        x: x + rand(-18, 18, 'loot'),
        y: y + rand(-18, 18, 'loot'),
        type: 'coin',
        value: Math.ceil(scaledAmount / chunks),
      });
    }
  }

  function rollItemDrop(options = {}) {
    const sandbox = getActiveSandboxSettings();
    if (sandbox) {
      const baseEntries = options.elite
        ? ITEM_DROP_WEIGHTS.map(([key, weight]) => [key, weight + (key !== 'neo_knife' ? 4 : 0)])
        : ITEM_DROP_WEIGHTS;
      const filteredEntries = baseEntries.filter(([key]) => sandbox.allowedItems.includes(key));
      if (filteredEntries.length > 0) {
        return rollFromWeightTable(buildWeightTable(filteredEntries), options.stream || 'loot', options.random);
      }
    }
    const table = options.elite ? ELITE_ITEM_DROP_TABLE : ITEM_DROP_TABLE;
    return rollFromWeightTable(table, options.stream || 'loot', options.random);
  }

  function grantXp(amount) {
    const stats = getItemStats();
    const gained = Math.max(1, Math.round(amount * getRunDifficultyScalars().xpRewardMultiplier * (stats.xpGainMultiplier || 1)));
    player.xp += gained;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      levelUp();
    }
  }

  function levelUp() {
    player.level += 1;
    achievementEvents.emit('player:leveled', { level: player.level });
    player.xpToNext = Math.round(player.xpToNext * 1.22);
    player.maxHp += 15;
    player.hp = Math.min(player.maxHp, player.hp + 15);
    player.attackPower += 3;
    player.attackSpeed += 0.01;
    markInventoryPanelDirty();
    particles.push({ x: player.x, y: player.y - 20, life: 0.9, text: `LV ${player.level}`, c: '#7dff9e' });
  }

  function collectItem(itemKey) {
    if (isChallengeActive('no_items')) {
      particles.push({ x: player.x, y: player.y - 28, life: 0.85, text: 'NO ITEMS', c: '#ff8a98' });
      return;
    }
    const item = itemRegistry.get(itemKey);
    if (!item) return;
    player.items[itemKey] = getItemCount(itemKey) + 1;
    if (isFirstRunTutorialActive()) tutorialState.gotRelic = true;
    markInventoryPanelDirty();
    pushItemNotification(itemKey, 1);
    const totalItems = Object.values(player.items).reduce((s, v) => s + Number(v || 0), 0);
    achievementEvents.emit('item:collected', { totalItems });

    if (itemKey === 'jesters_dice') {
      floorSkipPending += 3;
      const bonusItemCounts = {};
      for (let index = 0; index < 10; index += 1) {
        const rewardPool = ITEM_KEYS.filter(key => key !== 'jesters_dice');
        const key = rewardPool[irand(0, rewardPool.length - 1, 'loot')];
        player.items[key] = getItemCount(key) + 1;
        bonusItemCounts[key] = (bonusItemCounts[key] || 0) + 1;
        if (key === 'titan_heart') {
          player.maxHp = Math.max(120, Math.round(player.maxHp * 1.08));
          player.hp = Math.min(player.maxHp, Math.round(player.hp * 1.08));
        }
      }
      Object.entries(bonusItemCounts).forEach(([key, amount]) => {
        pushItemNotification(key, Number(amount), '(Jester bonus)');
      });
    } else if (itemKey === 'wizards_paw') {
      openWizardPawSelection();
    }

    if (itemKey === 'titan_heart') {
      player.maxHp = Math.max(120, Math.round(player.maxHp * 1.08));
      player.hp = Math.min(player.maxHp, Math.round(player.hp * 1.08));
    }

    if (!metaProgress.unlockedItems.includes(itemKey)) {
      metaProgress.unlockedItems.push(itemKey);
      persistMetaSoon();
      refreshMenuState();
    }

    updateItemUI();

    if (ITEM_KEYS.every(key => getItemCount(key) > 0) && godTimer <= 0) {
      godTimer = 12;
      for (let index = 0; index < 40; index += 1) {
        particles.push({
          x: player.x,
          y: player.y,
          life: 1.1,
          vx: rand(-220, 220),
          vy: rand(-220, 220),
          c: `hsl(${index * 9},100%,60%)`,
        });
      }
    }
  }

  function updateItemUI() {
    uiController.setItemStatus(player?.items || {});
  }

