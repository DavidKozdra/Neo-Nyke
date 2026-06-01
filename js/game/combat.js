// combat.js — standalone IIFE. Player attacks, hit resolution, status effects, XP/loot.
  function scaleDamageAgainstEnemy(enemy, damage, options = {}) {
    const stats = Neo.getItemStats();
    const applyBleedBonus = options.applyBleedBonus !== false;
    const defenseMultiplier = Math.max(1, Number(enemy?.defenseMultiplier || 1));
    const characterMultiplier = Neo.getCharacterDef().damageMultiplier || 1;
    const powered = (damage + (Neo.player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * (Neo.isChallengeActive('glass_cannon') ? 1.25 : 1);
    if (applyBleedBonus && Neo.getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.max(1, Math.round((powered * stats.bleedDamageMultiplier) / defenseMultiplier));
    }
    return Math.max(1, Math.round(powered / defenseMultiplier));
  }

  function scaleRawDamageAgainstEnemy(enemy, damage) {
    const defenseMultiplier = Math.max(1, Number(enemy?.defenseMultiplier || 1));
    return Math.max(1, Math.round(Number(damage || 0) / defenseMultiplier));
  }

  function getBloodMultiplier() {
    const value = window.NeoSettings?.getBloodMultiplier?.()
      ?? window.NeoSettings?.getGameplay?.()?.bloodMultiplier
      ?? window.NeoSettings?.getAccess?.()?.bloodMultiplier
      ?? 1;
    return Neo.clamp(Math.round(Number(value) || 1), 1, 10);
  }

  function shouldBloodOnHit() {
    return window.NeoSettings?.shouldBloodOnHit?.() !== false
      && window.NeoSettings?.getGameplay?.()?.bloodOnHit !== false;
  }

  function getEnemyBleedResistance(enemy) {
    const loopNumber = Math.max(1, Math.floor((Neo.floor - 1) / 10) + 1);
    const floorInLoop = ((Neo.floor - 1) % 10) + 1;
    let resistance = 1;
    resistance += Math.max(0, floorInLoop - 1) * Neo.BLEED_RESIST_SCALING.floorInLoop;
    resistance += Math.max(0, loopNumber - 1) * Neo.BLEED_RESIST_SCALING.loop;
    if (enemy?.elite) resistance += Neo.BLEED_RESIST_SCALING.elite;
    if (enemy?.miniBoss) resistance += Neo.BLEED_RESIST_SCALING.miniBoss;
    if (Neo.isBossType(enemy?.type) || enemy?.type === 'god') resistance += Neo.BLEED_RESIST_SCALING.boss;
    if (enemy?.type === 'rival' || enemy?.type === 'mirror_knight') resistance += Neo.BLEED_RESIST_SCALING.rival;
    return Math.max(1, resistance);
  }

  function scaleBleedDamageAgainstEnemy(enemy, stacks) {
    const baseBleed = 1.8 + Math.max(1, Number(stacks || 1)) * 2.2;
    const preResist = scaleDamageAgainstEnemy(enemy, baseBleed, { applyBleedBonus: false });
    const reduced = preResist / getEnemyBleedResistance(enemy);
    return Math.max(1, Math.round(reduced));
  }

  function getPlayerBaseDamage() {
    const characterMultiplier = Neo.getCharacterDef().damageMultiplier || 1;
    return Math.max(1, (Neo.ATTACKS.melee.damage + (Neo.player?.attackPower || 0)) * characterMultiplier);
  }

  function getEquippedMove(slot) {
    const moveKey = Neo.player?.equippedMoves?.[slot];
    if (Neo.MOVE_DEFS[moveKey]?.slot === slot) return moveKey;
    return Neo.getDefaultMovesForCharacter(Neo.player?.character || Neo.chosenCharacter)[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
  }

  function getEquippedWeapon() {
    const key = Neo.player?.equippedWeapon || '';
    return Neo.WEAPON_DEFS[key] ? key : '';
  }

  function getEnemyBeamDamageSource(enemy, damageSource = null) {
    const sourceKey = String(damageSource || enemy?.type || 'enemy_beam');
    if (damageSource) return { label: Neo.getDamageSourceLabel?.(sourceKey) || sourceKey, key: sourceKey };
    const enemyLabel = Neo.getEliteEnemyLabel?.(enemy) || Neo.getEnemyLabel?.(enemy?.type || '') || 'Enemy';
    return { label: `${enemyLabel} Beam`, key: String(enemy?.type || 'enemy_beam') };
  }

  function getWeaponBaseCooldown(weaponKey) {
    let base;
    if (weaponKey === 'extending_staff') base = 0.77;
    else if (weaponKey === 'hunters_bow') base = 0.4;
    else if (weaponKey === 'thorns_bleed_blade') base = Neo.ATTACKS.melee.baseCooldown;
    else if (weaponKey === 'claw_gauntlets') base = 0.38;
    else if (weaponKey === 'lazer_glasses') base = 3.6;
    else if (weaponKey === 'metao_fire_staff') base = 0.75;
    else if (weaponKey === 'magenta_degale') base = 1.5;
    else if (weaponKey === 'magenta_p90') base = 1.8;
    else if (weaponKey === 'granillia_lightning_spear') base = 0.75;
    else if (weaponKey === 'excalibur') base = 2;
    else if (weaponKey === 'golden_fleece') base = 0.5;
    else if (weaponKey === 'void_piercer') base = 0.8;
    else if (weaponKey === 'aegis_shield_weapon') base = 8;
    else if (weaponKey === 'princess_wand') base = 0.55;
    else base = 0.5;
    const bonus = Neo.getAnvilWeaponBonus(weaponKey, 'cooldown');
    return Math.max(base * 0.5, base + bonus);
  }

  function spawnWeaponProjectile(config = {}) {
    const angle = Number(config.angle || 0);
    const speed = Number(config.speed || 520);
    Neo.spawnProjectile({
      x: config.x ?? Neo.player.x,
      y: config.y ?? Neo.player.y,
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
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y);
      if (distance > range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > arc) continue;
      hitEnemy(enemy, damage, angle, push, color, options);
      if (options.bleedChance > 0 && Neo.nextRandom('encounter') < options.bleedChance) {
        applyBleed(enemy, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
      }
      if (options.itemBleedChance > 0 && Neo.nextRandom('encounter') < options.itemBleedChance) {
        applyBleed(enemy, 1, 5);
      }
    }

    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const potAssist = prop.kind === 'pot';
      const reachBonus = potAssist ? 24 : 10;
      const arcBonus = potAssist ? 0.4 : 0.2;
      const touchingBonus = potAssist ? 30 : 18;
      const propDistance = Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y);
      if (propDistance > range + prop.r + reachBonus) return;
      if (potAssist && propDistance <= range + prop.r + 26) {
        Neo.damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= Neo.player.r + prop.r + touchingBonus;
      if (!touching && difference > arc + arcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    if (Neo.player.weaponCooldown > 0) return false;
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const attackSpeed = Neo.getAttackSpeedValue();
    const itemStats = Neo.getItemStats();
    const wDmg  = k => Math.max(1, (Neo.WEAPON_BASE_STATS[k]?.damage  ?? 0) + Neo.getAnvilWeaponBonus(k, 'damage'));
    const wKnk  = k => Math.max(0, (Neo.WEAPON_BASE_STATS[k]?.knockback ?? 0) + Neo.getAnvilWeaponBonus(k, 'knockback'));
    const wRng  = k => Math.max(10, (Neo.WEAPON_BASE_STATS[k]?.range   ?? 120) + Neo.getAnvilWeaponBonus(k, 'range'));
    const wCd   = k => getWeaponBaseCooldown(k);
    if (weaponKey === 'extending_staff') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), 1.45, wKnk(weaponKey), '#ff3333');
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'hunters_bow') {
      spawnWeaponProjectile({ angle, speed: 820, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 4, life: 0.9, kind: 'hunters_bow', color: '#f0fbff', pierceCount: 1, hitOptions: { critBonus: 0.1 } });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'thorns_bleed_blade') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Neo.ATTACKS.melee.arc, wKnk(weaponKey), '#ff6e8b', { bleedChance: 0.10, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'claw_gauntlets') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Math.PI * 0.7, wKnk(weaponKey), '#ff7a9a', { bleedChance: 0.22, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'lazer_glasses') {
      Neo.player.weaponBeamTime = 0.65;
      Neo.player.weaponBeamTick = 0;
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'metao_fire_staff') {
      spawnFireballs();
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'magenta_degale') {
      spawnWeaponProjectile({ angle, speed: 920, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 7, life: 0.9, kind: 'magenta_degale', color: '#ff8bd2' });
      Neo.player.vx -= Math.cos(angle) * 280;
      Neo.player.vy -= Math.sin(angle) * 280;
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'magenta_p90') {
      for (let shot = 0; shot < 5; shot += 1) {
        Neo.weaponBurstQueue.push({
          delay: shot * 0.04,
          angle: angle + Neo.rand(0.05, -0.05, 'encounter'),
          weaponKey,
        });
      }
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'granillia_lightning_spear') {
      castSmiteChain();
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'excalibur') {
      const excaliburDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 7.77 + Neo.getAnvilWeaponBonus(weaponKey, 'damage')));
      fireWeaponSweep(excaliburDamage, wRng(weaponKey), Math.PI, wKnk(weaponKey), '#ffe291', { rawDamage: true });
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.6, ring: 56, c: '#ffd26a' });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Neo.ATTACKS.melee.arc, wKnk(weaponKey), '#ffe8a0');
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'void_piercer') {
      spawnWeaponProjectile({ angle, speed: 760, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 6, life: 1.2, kind: 'void_piercer', color: '#ffd2c0', pierceCount: 4, hitOptions: { ignoreBarrier: true, critBonus: 0.2 } });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'aegis_shield_weapon') {
      Neo.player.blockActive = true;
      Neo.player.blockTimer = 2;
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.5, ring: 26, c: '#9ae9ff' });
      return true;
    }
    if (weaponKey === 'princess_wand') {
      spawnWeaponProjectile({ angle, speed: 680, damage: wDmg(weaponKey), knockback: wKnk(weaponKey), r: 5, life: 1.0, kind: 'princess_wand', color: '#ff9de8', pierceCount: 1 });
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.18, ring: 10, c: '#ff9de8' });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
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
    const itemStats = Neo.getItemStats();
    const attackSpeed = Neo.getAttackSpeedValue();
    if (!Neo.spendSkillCharge('melee', Neo.getMeleeCooldownDuration(move, attackSpeed))) return;
    if (itemStats.hasRobotArm && Neo.player?.robotArmReady) Neo.consumeCharge('robot_arm');
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
    if (move === 'mooggy_swipe') {
      castMooggySwipe();
      return;
    }
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;

    const anvilDmgBonus = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRngBonus = Neo.getAnvilMoveBonus(move, 'range');
    const damage = (Neo.godTimer > 0 ? 56 : Neo.ATTACKS.melee.damage) + anvilDmgBonus;
    const meleeRange = Neo.ATTACKS.melee.range + anvilRngBonus;
    const meleeKnockback = move === 'slash' ? Neo.SLASH_KNOCKBACK : Neo.ATTACKS.melee.push;
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y);
      if (distance > meleeRange + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > Neo.ATTACKS.melee.arc) continue;
      hitEnemy(enemy, damage, angle, meleeKnockback, '#0ff');
      const slashBleedChance = move === 'slash' ? 0.10 : 0;
      if (slashBleedChance > 0 && Neo.rng() < slashBleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.bleedChance > 0 && Neo.rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.weaponFatigueChance > 0 && Neo.rng() < itemStats.weaponFatigueChance) {
        Neo.applyStatus(enemy, 'slow', 1, 4);
      }
      if (itemStats.snakeKnifePoisonChance > 0 && Neo.rng() < itemStats.snakeKnifePoisonChance) {
        applyPoison(enemy, 1, 4);
      }
    }
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const slashPotAssist = move === 'slash' && prop.kind === 'pot';
      const destructibleReachBonus = slashPotAssist ? 24 : 8;
      const destructibleArcBonus = slashPotAssist ? 0.45 : 0.25;
      const touchingBonus = slashPotAssist ? 32 : 18;
      const propDistance = Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y);
      if (propDistance > meleeRange + prop.r + destructibleReachBonus) return;
      if (slashPotAssist && propDistance <= meleeRange + prop.r + 24) {
        Neo.damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      const touching = propDistance <= Neo.player.r + prop.r + touchingBonus;
      if (!touching && difference > Neo.ATTACKS.melee.arc + destructibleArcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function fireLazerGlassesTick() {
    const baseAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    [-0.2, 0.2].forEach(offset => {
      const angle = baseAngle + offset;
      const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, 430, Neo.LAZER_GLASSES_BOUNCES);
      let target = null;
      let hitSegment = null;
      for (let index = 0; index < Neo.enemies.length; index += 1) {
        const enemy = Neo.enemies[index];
        if (!enemy) continue;
        hitSegment = Neo.beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + 4);
        if (hitSegment) {
          target = enemy;
          break;
        }
      }
      if (target) {
        hitEnemy(target, 9, hitSegment?.angle ?? angle, 80, '#cda8ff', { fireChance: 0.05, fireStacks: 1, fireDuration: 3 });
      }
      Neo.destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && Neo.beamPathHitsDestructible(beamPath, prop, 4)) {
          Neo.damageDestructible(prop, 1);
        }
      });
    });
  }

  function updateWeaponSystems(dt) {
    Neo.player.weaponCooldown = Math.max(0, Number(Neo.player.weaponCooldown || 0) - dt);
    if (Neo.player.blockTimer > 0) {
      Neo.player.blockTimer = Math.max(0, Neo.player.blockTimer - dt);
      Neo.player.blockActive = Neo.player.blockTimer > 0;
      if (Neo.player.blockActive && Neo.nextRandom('fx') < 0.25) {
        Neo.spawnParticle({ x: Neo.player.x + Neo.rand(18, -18, 'fx'), y: Neo.player.y + Neo.rand(18, -18, 'fx'), life: 0.2, c: '#9cefff' });
      }
    } else {
      Neo.player.blockActive = false;
    }

    const equippedWeapon = getEquippedWeapon();
    if (equippedWeapon === 'golden_fleece') {
      Neo.player.fleeceTick += dt;
      if (Neo.player.fleeceTick >= 2) {
        Neo.player.fleeceTick = 0;
        const heal = Neo.scalePlayerHealing(Neo.player.maxHp * 0.06);
        const before = Neo.player.hp;
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        if (Neo.player.hp > before) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, Neo.player.hp - before, { color: '#ffe59c' });
      }
    } else {
      Neo.player.fleeceTick = 0;
    }

    if (equippedWeapon === 'lazer_glasses' && Neo.player.weaponBeamTime > 0) {
      Neo.player.weaponBeamTime = Math.max(0, Neo.player.weaponBeamTime - dt);
      Neo.player.weaponBeamTick = Number(Neo.player.weaponBeamTick || 0) - dt;
      if (Neo.player.weaponBeamTick <= 0) {
        Neo.player.weaponBeamTick = 0.08;
        fireLazerGlassesTick();
      }
    }

    for (let index = Neo.weaponBurstQueue.length - 1; index >= 0; index -= 1) {
      const queued = Neo.weaponBurstQueue[index];
      queued.delay -= dt;
      if (queued.delay > 0) continue;
      if (queued.weaponKey === 'magenta_p90') {
        const p90Dmg = Math.max(1, (Neo.WEAPON_BASE_STATS.magenta_p90?.damage ?? 18) + Neo.getAnvilWeaponBonus('magenta_p90', 'damage'));
        const p90Knk = Math.max(0, (Neo.WEAPON_BASE_STATS.magenta_p90?.knockback ?? 140) + Neo.getAnvilWeaponBonus('magenta_p90', 'knockback'));
        spawnWeaponProjectile({ angle: queued.angle, speed: 900, damage: p90Dmg, knockback: p90Knk, r: 4, life: 0.8, kind: 'magenta_p90', color: '#ff9dd7' });
        Neo.player.vx -= Math.cos(queued.angle) * 55;
        Neo.player.vy -= Math.sin(queued.angle) * 55;
      }
      Neo.weaponBurstQueue.splice(index, 1);
    }
  }

  function tryLaser() {
    cancelCowardsWayOnAttack();
    if (Neo.laserActive) return;
    const attackSpeed = Neo.getAttackSpeedValue();
    const move = getEquippedMove('laser');
    const rechargeTime = Neo.getLaserCooldownDuration(move, attackSpeed);
    if (move === 'turtle_wave') {
      if (Neo.player.hp <= 1) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.52, text: 'NEED HP', c: '#ff8b98' });
        return;
      }
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'turtle_wave';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      return;
    }
    if (move === 'power_disks') {
      if (!Neo.spendSkillCharge('laser', rechargeTime)) return;
      spawnPlayerDiskBurst();
      return;
    }
    if (move === 'blade_justice') {
      if (!Neo.spendSkillCharge('laser', rechargeTime)) return;
      castBladeOfJustice();
      return;
    }
    if (move === 'love_beam') {
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'beam';
      Neo.loveBeamCasting = true;
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      return;
    }
    if (move === 'lightning_columns') {
      if (!Neo.spendSkillCharge('laser', rechargeTime)) return;
      castLightningColumns();
      return;
    }
    if (move === 'god_sweep') {
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'god_sweep';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      Neo.laserSweepSpeed = (Neo.nextRandom('encounter') < 0.5 ? -1 : 1) * 4.6;
      return;
    }
    if (move === 'nail_shot') {
      if (!Neo.spendSkillCharge('laser', rechargeTime)) return;
      castNailShot();
      return;
    }
    if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
    Neo.laserActive = true;
    Neo.laserMode = 'beam';
    Neo.laserTime = Neo.getLaserCastDuration(move);
    Neo.laserTick = 0;
    Neo.turtleWaveHpTimer = 0;
    Neo.laserAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
  }

  function endActiveLaser() {
    if (!Neo.laserActive) return;
    Neo.laserActive = false;
    Neo.laserMode = 'beam';
    Neo.loveBeamCasting = false;
    Neo.turtleWaveHpTimer = 0;
    Neo.queueHeldSkillRecharge('laser', Neo.getLaserCooldownDuration(getEquippedMove('laser'), Neo.getAttackSpeedValue()));
  }

  function tickTurtleWaveHpDrain(dt) {
    if (Neo.laserMode !== 'turtle_wave') return false;
    Neo.turtleWaveHpTimer += dt;
    while (Neo.turtleWaveHpTimer >= 1) {
      Neo.turtleWaveHpTimer -= 1;
      const drain = Math.min(Neo.TURTLE_WAVE_HP_PER_SECOND, Math.max(0, Neo.player.hp - 1));
      if (drain <= 0) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
      Neo.player.hp = Math.max(1, Neo.player.hp - drain);
      if (!Neo.isBossFightActive()) Neo.player.roomDamageTaken = (Neo.player.roomDamageTaken || 0) + drain;
      Neo.spawnDamagePopup(Neo.player.x, Neo.player.y - 18, drain, { color: '#74f5ff', size: 14 });
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.42, text: `-${drain} HP`, c: '#74f5ff' });
      if (Neo.player.hp <= 1) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
        return true;
      }
    }
    return false;
  }

  function updatePlayerLaser(dt) {
    if (!Neo.laserActive) return;
    Neo.laserTime -= dt;
    Neo.laserTick -= dt;
    if (tickTurtleWaveHpDrain(dt)) {
      endActiveLaser();
      return;
    }
    const move = getEquippedMove('laser');
    const itemStats = Neo.getItemStats();
    const loveBeamActive = Neo.loveBeamCasting && move === 'love_beam';
    const weight = Math.max(0, Number(itemStats.laserWeightMultiplier ?? 1));
    if (Neo.laserMode !== 'god_sweep') {
      const targetAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const baseTurnRate = 3.5;
      const turnRate = weight > 0 ? baseTurnRate / weight : baseTurnRate * 100;
      const maxStep = turnRate * dt;
      let delta = targetAngle - Neo.laserAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const step = Math.max(-maxStep, Math.min(maxStep, delta));
      Neo.laserAngle += step;
    }
    const angle = Neo.laserAngle;
    const recoilAccel = 45 * weight;
    if (recoilAccel > 0) {
      Neo.player.vx -= Math.cos(angle) * recoilAccel * dt;
      Neo.player.vy -= Math.sin(angle) * recoilAccel * dt;
    }
    if (Neo.laserTick <= 0) {
      if (Neo.laserMode === 'god_sweep') Neo.laserAngle += Neo.laserSweepSpeed * 0.05;
      Neo.laserTick = Neo.laserMode === 'god_sweep' ? 0.05 : Neo.laserMode === 'turtle_wave' ? 0.08 : loveBeamActive ? 0.06 : Neo.ATTACKS.laser.tick;
      const range = Neo.getPlayerBeamRange(Neo.laserMode, move);
      const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, range, Neo.getPlayerBeamBounceCount(Neo.laserMode));
      let loveBeamHits = 0;
      for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = Neo.enemies[index];
        if (!enemy) continue;
        const hitSegment = Neo.beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + (Neo.laserMode === 'turtle_wave' ? 14 : 6));
        if (!hitSegment) continue;
        const anvilBeamBonus = Neo.getAnvilMoveBonus(move, 'damage');
        const baseBeamDamage = Neo.laserMode === 'god_sweep'
          ? 12
          : Neo.laserMode === 'turtle_wave'
            ? 34
            : loveBeamActive
              ? 18
              : Neo.godTimer > 0
                ? 16
                : Neo.ATTACKS.laser.damage;
        const beamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1);
        const anvilCritBonus = Neo.getAnvilMoveBonus(move, 'critChance');
        hitEnemy(enemy, beamDamage, hitSegment.angle, Neo.laserMode === 'god_sweep' ? 120 : Neo.laserMode === 'turtle_wave' ? 155 : loveBeamActive ? 52 : 60, loveBeamActive ? '#ff9ed6' : '#f0f', anvilCritBonus > 0 ? { critBonus: anvilCritBonus } : {});
        chainBeamHit(enemy, beamDamage, hitSegment.angle, loveBeamActive ? '#ffb8e0' : '#d890ff');
        if (loveBeamActive) loveBeamHits += 1;
        if (move === 'blood_beam' && Neo.rng() < 0.05) applyBleed(enemy, 1, 3.2);
        if (move === 'blood_beam' && Neo.rng() < 0.08) applyDarkDrain(enemy, 1, 3.4);
      }
      const anvilBeamBonus = Neo.getAnvilMoveBonus(move, 'damage');
      const baseBeamDamage = Neo.laserMode === 'god_sweep'
        ? 12
        : Neo.laserMode === 'turtle_wave'
          ? 34
          : loveBeamActive
            ? 18
            : Neo.godTimer > 0
              ? 16
              : Neo.ATTACKS.laser.damage;
      const pvpBeamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1);
      Neo.hitPvpPlayer2WithBeamPath?.(
        beamPath,
        Neo.laserMode === 'turtle_wave' ? 14 : 6,
        pvpBeamDamage,
        Neo.laserMode === 'god_sweep' ? 120 : Neo.laserMode === 'turtle_wave' ? 155 : loveBeamActive ? 52 : 60,
        'pvp_p1_beam',
      );
      Neo.destructibles.forEach(prop => {
        if (!prop.broken && !prop.hidden && Neo.beamPathHitsDestructible(beamPath, prop, 4)) {
          Neo.damageDestructible(prop, 1);
        }
      });
      if (loveBeamHits > 0) {
        const heal = Neo.scalePlayerHealing(Math.min(8, loveBeamHits * 1.25));
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, heal, { color: '#ff9ed6' });
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 0.22, text: 'LOVE', c: '#ff9ed6' });
      }
    }
    if (Neo.laserTime <= 0) {
      endActiveLaser();
    }
  }

  function tryUsePotion() {
    if (!Neo.player || Neo.gameState !== 'play') return;
    const stored = Number(Neo.player.storedPotions || 0);
    if (stored <= 0) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'NO POTION', c: '#ff7070' });
      return;
    }
    if (Neo.player.hp >= Neo.player.maxHp) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'FULL HP', c: '#a0ffa0' });
      return;
    }
    Neo.player.storedPotions = stored - 1;
    const heal = Neo.getPotionHealAmount();
    const before = Neo.player.hp;
    Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
    const gained = Neo.player.hp - before;
    if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
    Neo.updateHud();
  }

  function trySmash() {
    cancelCowardsWayOnAttack();
    const itemStats = Neo.getItemStats();
    const attackSpeed = Neo.getAttackSpeedValue();
    if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed))) return;
    if (itemStats.homingMissileChance > 0 && Neo.nextRandom('encounter') < itemStats.homingMissileChance) {
      const base = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      for (let index = 0; index < 2; index += 1) {
        const angle = base + (index === 0 ? -0.12 : 0.12);
        Neo.spawnProjectile({
          x: Neo.player.x,
          y: Neo.player.y,
          vx: Math.cos(angle) * 260,
          vy: Math.sin(angle) * 260,
          r: 6,
          life: 2.4,
          enemy: false,
          kind: 'homing_missile',
          damage: 18,
          knockback: 140,
          color: '#ffe06f',
          homing: true,
          homingTarget: 'enemy',
          homingRadius: 960,
          homingSpeed: 420,
          homingAccel: 3.8,
          homingTurnRate: 3.4,
        });
      }
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 22, life: 0.5, ring: 18, c: '#ffe06f' });
    }
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
    if (move === 'fangs_of_death') {
      castFangsOfDeath();
      return;
    }
    const anvilSmashRange = Neo.getAnvilMoveBonus(move, 'range');
    const smashRadius = (Neo.ATTACKS.smash.radius + anvilSmashRange) * (itemStats.aoeRadiusMultiplier || 1);
    Neo.shake = 16;
    Neo.shakeT = 0.24;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.4, ring: smashRadius - 30, c: '#ff00aa' });
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, smashRadius, '#ff66cc', 'heavy');
    Neo.hitPvpPlayer2InRadius?.(Neo.player.x, Neo.player.y, smashRadius, Neo.ATTACKS.smash.damage + Neo.getAnvilMoveBonus(move, 'damage'), 320, 'pvp_p1_smash');
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y);
      if (distance > smashRadius + enemy.r) continue;
      const angle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      let damage = (Neo.godTimer > 0 ? 82 : Neo.ATTACKS.smash.damage) + Neo.getAnvilMoveBonus(move, 'damage');
      if (itemStats.bleedDamageMultiplier > 1 && Neo.getStatusStacks(enemy, 'bleed') > 0) {
        damage += Neo.ATTACKS.smash.bonus;
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, '#ff66cc');
      enemy.stun = 0.5;
    }
    Neo.destructibles.forEach(prop => {
      if (!prop.broken && !prop.hidden && Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y) <= smashRadius + prop.r) {
      Neo.damageDestructible(prop, 2);
      }
    });
  }

  function tryDash(moveX, moveY) {
    if (Neo.player.dashTime > 0) return;
    const move = getEquippedMove('dash');
    const attackSpeed = Neo.getAttackSpeedValue();
    const rechargeTime = Neo.getDashCooldownDuration(move, attackSpeed);
    if (!Neo.spendSkillCharge('dash', rechargeTime)) return;
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
    if (move === 'mooggy_zoomies') {
      castMooggyZoomies();
      return;
    }
    castDashBurst(moveX, moveY);
  }

  function castMooggySwipe() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('melee');
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRng = Neo.getAnvilMoveBonus(move, 'range');
    const damage = (Neo.godTimer > 0 ? 72 : 44) + anvilDmg;
    const range = 130 + anvilRng;
    const arc = Math.PI * 0.72;
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      if (Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y) > range + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const diff = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (diff > arc) continue;
      hitEnemy(enemy, damage, angle, Neo.ATTACKS.melee.push, '#ff6090');
      if (Neo.rng() < 0.12 + itemStats.bleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.snakeKnifePoisonChance > 0 && Neo.rng() < itemStats.snakeKnifePoisonChance) applyPoison(enemy, 1, 4);
    }
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y) > range + prop.r + 8) return;
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const diff = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (diff > arc + 0.25) return;
      Neo.damageDestructible(prop, 1);
    });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.22, ring: 28, c: '#ff6090' });
  }

  function castNailShot() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('laser');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const damage = 18 + anvilDmg;
    const nailCount = 12;
    const speed = 480 * (itemStats.projectileSpeedMultiplier || 1);
    for (let index = 0; index < nailCount; index += 1) {
      const angle = (index / nailCount) * Math.PI * 2 + Neo.rng() * 0.22;
      Neo.spawnProjectile({
        x: Neo.player.x,
        y: Neo.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3,
        life: 1.8,
        enemy: false,
        kind: 'nail',
        damage,
        knockback: 80,
        color: '#c0d8ff',
        bouncesRemaining: 3 + Math.floor(itemStats.projectileBounces || 0),
        hitOptions: { bleedChance: 0.08 },
      });
    }
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.3, ring: 22, c: '#c0d8ff' });
  }

  function castFangsOfDeath() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('smash');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRng = Neo.getAnvilMoveBonus(move, 'range');
    const aoeRadius = (160 + anvilRng) * (itemStats.aoeRadiusMultiplier || 1);
    const aoeDmgMult = itemStats.aoeDamageMultiplier || 1;
    const blastDmg = Math.round((Neo.godTimer > 0 ? 78 : 52) * aoeDmgMult) + anvilDmg;

    Neo.shake = Math.max(Neo.shake, 18);
    Neo.shakeT = Math.max(Neo.shakeT, 0.28);
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, blastDmg, '#ff3070');
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, aoeRadius, '#ff3070', 'heavy');
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.5, ring: aoeRadius - 24, c: '#ff3070' });
    applyStatusInRadius(Neo.player.x, Neo.player.y, aoeRadius, 'bleed', 2, 5);

    const fangCount = 8;
    const targets = Neo.enemies.slice().sort(() => Neo.rng() - 0.5).slice(0, fangCount);
    for (let index = 0; index < fangCount; index += 1) {
      const spreadAngle = (index / fangCount) * Math.PI * 2;
      const target = targets[index % targets.length];
      let vx, vy;
      if (target) {
        const toTarget = Math.atan2(target.y - Neo.player.y, target.x - Neo.player.x);
        const jitter = (Neo.rng() - 0.5) * 0.5;
        vx = Math.cos(toTarget + jitter) * 620;
        vy = Math.sin(toTarget + jitter) * 620;
      } else {
        vx = Math.cos(spreadAngle) * 560;
        vy = Math.sin(spreadAngle) * 560;
      }
      const fangDmg = Math.round((Neo.godTimer > 0 ? 34 : 24) * aoeDmgMult) + anvilDmg;
      Neo.spawnProjectile({
        x: Neo.player.x,
        y: Neo.player.y,
        vx, vy,
        r: 5,
        life: 1.1,
        enemy: false,
        kind: 'fang',
        damage: fangDmg,
        knockback: 180,
        color: '#ff5090',
        hitOptions: { bleedChance: 0.55, bleedStacks: 2, bleedDuration: 5, critBonus: 0.35 },
        homing: targets.length > 0,
        homingTarget: 'enemy',
        homingRadius: 380,
        homingSpeed: 680,
        homingAccel: 4.2,
        homingTurnRate: 3.8,
      });
    }
  }

  function castMooggyZoomies() {
    Neo.player.mooggyZoomiesTime = 12;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.9, text: 'ZOOMIES!', c: '#a0ffcc' });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.35, ring: 24, c: '#a0ffcc' });
  }

  function castDashBurst(moveX, moveY) {
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const dashSpeed = (520 + Neo.player.attackSpeed * 28) * (Neo.godTimer > 0 ? 1.1 : 1);
    Neo.player.dashTime = 0.16;
    Neo.player.dashX = Math.cos(angle) * dashSpeed;
    Neo.player.dashY = Math.sin(angle) * dashSpeed;
    Neo.player.vx = Neo.player.dashX;
    Neo.player.vy = Neo.player.dashY;
    Neo.player.inv = Math.max(Neo.player.inv, 0.18);
    Neo.shake = Math.max(Neo.shake, 3);
    Neo.shakeT = Math.max(Neo.shakeT, 0.08);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.28, ring: 18, c: '#fff06a' });
  }

  function cancelCowardsWayOnAttack() {
    if (Neo.player.cowardsWayTime <= 0) return;
    Neo.player.cowardsWayTime = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.42, text: "COWARD'S WAY BROKEN", c: '#ffd27a' });
  }

  function findSafePointNearTarget(tx, ty, radius = Neo.player.r, maxRadius = 220, step = 22) {
    const clampedX = Neo.clamp(tx, Neo.WALL + radius + 2, Neo.ROOM_W - Neo.WALL - radius - 2);
    const clampedY = Neo.clamp(ty, Neo.WALL + radius + 2, Neo.ROOM_H - Neo.WALL - radius - 2);
    if (!Neo.isBlocked(clampedX, clampedY, radius)) return { x: clampedX, y: clampedY };
    for (let distStep = step; distStep <= maxRadius; distStep += step) {
      const checks = Math.max(8, Math.floor((Math.PI * 2 * distStep) / step));
      for (let index = 0; index < checks; index += 1) {
        const angle = (index / checks) * Math.PI * 2;
        const px = Neo.clamp(clampedX + Math.cos(angle) * distStep, Neo.WALL + radius + 2, Neo.ROOM_W - Neo.WALL - radius - 2);
        const py = Neo.clamp(clampedY + Math.sin(angle) * distStep, Neo.WALL + radius + 2, Neo.ROOM_H - Neo.WALL - radius - 2);
        if (!Neo.isBlocked(px, py, radius)) return { x: px, y: py };
      }
    }
    return null;
  }

  function getWarpLandingPoint(targetX = Neo.mouse.worldX, targetY = Neo.mouse.worldY) {
    if (!Neo.player) return null;
    const radius = Neo.player.r;
    const minX = Neo.WALL + radius + 2;
    const maxX = Neo.ROOM_W - Neo.WALL - radius - 2;
    const minY = Neo.WALL + radius + 2;
    const maxY = Neo.ROOM_H - Neo.WALL - radius - 2;
    const tx = Neo.clamp(Number(targetX) || Neo.player.x, minX, maxX);
    const ty = Neo.clamp(Number(targetY) || Neo.player.y, minY, maxY);
    const cx = Neo.clamp(tx, minX, maxX);
    const cy = Neo.clamp(ty, minY, maxY);
    const point = !Neo.isBlocked(cx, cy, radius)
      ? { x: cx, y: cy }
      : findSafePointNearTarget(cx, cy, radius, 210, 18);
    if (!point) return null;
    return {
      x: point.x,
      y: point.y,
      targetX: tx,
      targetY: ty,
      adjustedFromCursor: Neo.dist(point.x, point.y, tx, ty) > 18,
    };
  }

  function teleportPlayerTo(targetX, targetY, color = '#b99cff') {
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.35, ring: 18, c: color });
    Neo.player.x = targetX;
    Neo.player.y = targetY;
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.35, ring: 18, c: color });
  }

  function castNimrodStomp(moveX, moveY) {
    const itemStats = Neo.getItemStats();
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
    const edgePad = Neo.WALL + Neo.player.r + 4;
    const targetX = horizontal
      ? (Math.cos(angle) >= 0 ? Neo.ROOM_W - edgePad : edgePad)
      : Neo.player.x;
    const targetY = horizontal
      ? Neo.clamp(Neo.mouse.worldY, edgePad, Neo.ROOM_H - edgePad)
      : (Math.sin(angle) >= 0 ? Neo.ROOM_H - edgePad : edgePad);
    const landingPoint = findSafePointNearTarget(targetX, targetY, Neo.player.r, 260, 24)
      || findSafePointNearTarget(Neo.player.x + Math.cos(angle) * 240, Neo.player.y + Math.sin(angle) * 240, Neo.player.r, 140, 20);
    if (!landingPoint) return;
    teleportPlayerTo(landingPoint.x, landingPoint.y, '#fff06a');
    const aoeRadius = 108 * (itemStats.aoeRadiusMultiplier || 1);
    const stompDamage = Neo.godTimer > 0 ? 64 : 46;
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, stompDamage, '#ffe67a');
    Neo.shake = Math.max(Neo.shake, 14);
    Neo.shakeT = Math.max(Neo.shakeT, 0.22);
    Neo.player.inv = Math.max(Neo.player.inv, 0.32);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.44, ring: aoeRadius, c: '#ffe67a' });
  }

  function castCowardsWay() {
    Neo.player.cowardsWayTime = 3;
    Neo.player.inv = Math.max(Neo.player.inv, 0.25);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.72, text: "COWARD'S WAY", c: '#8dffcf' });
  }

  function castZipLightning(moveX, moveY) {
    const itemStats = Neo.getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = Neo.godTimer > 0 ? 34 : 26;
    let sourceX = Neo.player.x;
    let sourceY = Neo.player.y;
    let performedHop = false;
    for (let hop = 0; hop < hops; hop += 1) {
      const searchX = hop === 0 ? Neo.mouse.worldX : sourceX;
      const searchY = hop === 0 ? Neo.mouse.worldY : sourceY;
      const target = Neo.findNearestEnemy(searchX, searchY, hop === 0 ? 280 : 260, visited)
        || Neo.findNearestEnemy(sourceX, sourceY, 260, visited);
      if (!target) break;
      visited.add(target);
      const toward = Math.atan2(target.y - sourceY, target.x - sourceX);
      const landDist = target.r + Neo.player.r + 8;
      const landing = findSafePointNearTarget(
        target.x - Math.cos(toward) * landDist,
        target.y - Math.sin(toward) * landDist,
        Neo.player.r,
        90,
        14
      );
      if (landing) teleportPlayerTo(landing.x, landing.y, '#95deff');
      sourceX = Neo.player.x;
      sourceY = Neo.player.y;
      performedHop = true;

      const hitAngle = Math.atan2(target.y - Neo.player.y, target.x - Neo.player.x);
      hitEnemy(target, baseDamage, hitAngle, 185, '#95deff');

      const chained = new Set([target]);
      let chainSource = target;
      for (let chainIndex = 0; chainIndex < 2; chainIndex += 1) {
        const chainedEnemy = Neo.findNearestEnemy(chainSource.x, chainSource.y, 156, chained);
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
        Neo.spawnParticle({ x: (chainSource.x + chainedEnemy.x) * 0.5, y: (chainSource.y + chainedEnemy.y) * 0.5, life: 0.2, c: '#9adfff' });
        chainSource = chainedEnemy;
      }
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.22, ring: 16 + hop * 4, c: '#84cfff' });
    }

    if (!performedHop) {
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const fallback = findSafePointNearTarget(Neo.player.x + Math.cos(angle) * 190, Neo.player.y + Math.sin(angle) * 190, Neo.player.r, 120, 16);
      if (fallback) teleportPlayerTo(fallback.x, fallback.y, '#95deff');
    }

    Neo.shake = Math.max(Neo.shake, 8);
    Neo.shakeT = Math.max(Neo.shakeT, 0.14);
    Neo.player.inv = Math.max(Neo.player.inv, 0.26);
    const zipShock = 72 * (itemStats.aoeRadiusMultiplier || 1);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.24, ring: zipShock, c: '#8ad9ff' });
  }

  function castNarwalFight() {
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    fireWeaponSweep(40, 136, 1.45, 280, '#ff8ed0');
    spawnWeaponProjectile({
      x: Neo.player.x + Math.cos(angle) * 22,
      y: Neo.player.y + Math.sin(angle) * 22,
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
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.32, ring: 22, c: '#ff8ed0' });
  }

  function castKickyKick() {
    const itemStats = Neo.getItemStats();
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const radius = 138 * (itemStats.aoeRadiusMultiplier || 1);
    const kickDamage = 92;
    const kickKnockback = 720;
    Neo.blastRadius(Neo.player.x, Neo.player.y, radius, kickDamage, '#ff7fc2');
    Neo.enemies.forEach(enemy => {
      if (!enemy) return;
      if (Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y) > radius + enemy.r) return;
      const enemyAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      enemy.vx += Math.cos(enemyAngle) * kickKnockback;
      enemy.vy += Math.sin(enemyAngle) * kickKnockback;
      enemy.stun = Math.max(enemy.stun, 0.7);
    });
    Neo.player.vx -= Math.cos(angle) * 260;
    Neo.player.vy -= Math.sin(angle) * 260;
    Neo.shake = Math.max(Neo.shake, 10);
    Neo.shakeT = Math.max(Neo.shakeT, 0.18);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.42, ring: radius * 0.85, c: '#ff7fc2' });
  }

  function castFlyingUntouchable() {
    Neo.player.princessFlightTime = 15;
    Neo.player.inv = Math.max(Neo.player.inv, 15);
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.8, text: 'FLY HIGH', c: '#ffd1ea' });
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
      const isMetao = Neo.player?.character === 'metao';
      Neo.spawnProjectile({ x: Neo.player.x, y: Neo.player.y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, r: 7, life: 1.2, enemy: false, kind: 'disk', damage: 20, hitOptions: isMetao ? { fireChance: 0.4, fireStacks: 1, fireDuration: 3 } : {} });
    }
  }

  function spawnFireballs() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const base = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      Neo.spawnProjectile({ x: Neo.player.x, y: Neo.player.y, vx: Math.cos(angle) * 384, vy: Math.sin(angle) * 384, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 * aoeRadiusMultiplier, splashDamage: Math.round(14 * aoeDamageMultiplier), blockedSplashDamage: Math.round(16 * aoeDamageMultiplier), fireStacks: 2, fireDuration: 3.4 });
    }
  }

  function castChaosBurst() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const isMetao = Neo.player?.character === 'metao';
    for (let index = 0; index < 6; index += 1) {
      const angle = Neo.rng() * Math.PI * 2;
      const px = Neo.player.x + Math.cos(angle) * Neo.rand(160, 40);
      const py = Neo.player.y + Math.sin(angle) * Neo.rand(160, 40);
      Neo.spawnParticle({ x: px, y: py, life: 0.45, ring: 18 * aoeRadiusMultiplier, c: 'red' });
      Neo.blastRadius(px, py, 52 * aoeRadiusMultiplier, Math.round(24 * aoeDamageMultiplier), 'red');
      applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'poison', 1, 4.8);
      if (isMetao) applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'fire', 1, 3.5);
    }
  }

  function castBladeOfJustice() {
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y);
      if (distance > 110 + enemy.r) continue;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) continue;
      hitEnemy(enemy, 34, angle, 280, '#fff6a3');
    }
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      if (Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y) > 110 + prop.r) return;
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > 1.3) return;
      Neo.damageDestructible(prop, 2);
    });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.5, ring: 36, c: '#fff6a3' });
  }

  function castSmiteChain() {
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;

    // Physical swing: hits enemies and destructibles in an arc.
    const physicalDamage = 20;
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y);
      if (distance > Neo.ATTACKS.melee.range + enemy.r + 4) continue;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > Neo.ATTACKS.melee.arc + 0.15) continue;
      hitEnemy(enemy, physicalDamage, angle, Neo.ATTACKS.melee.push, '#fff6a3');
    }
    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden) return;
      const distance = Neo.dist(Neo.player.x, Neo.player.y, prop.x, prop.y);
      if (distance > Neo.ATTACKS.melee.range + prop.r + 4) return;
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle)));
      if (difference > Neo.ATTACKS.melee.arc + 0.15) return;
      Neo.damageDestructible(prop, 2);
    });

    const origin = findNearestSmiteTarget(Neo.player.x, Neo.player.y, 280);
    if (!origin) return;

    let current = origin;
    let fromX = Neo.player.x;
    let fromY = Neo.player.y;
    const hit = new Set();
    for (let jumps = 0; jumps < 5 && current; jumps += 1) {
      hit.add(current.ref);
      const strikeDamage = 18 + jumps * 4;
      if (current.type === 'enemy') {
        hitEnemy(current.ref, strikeDamage, Math.atan2(current.y - fromY, current.x - fromX), 90, '#dfe8ff');
      } else {
        Neo.damageDestructible(current.ref, Math.max(2, Math.round(strikeDamage / 10)));
      }
      Neo.spawnParticle({ x: current.x, y: current.y, life: 0.32, ring: 18 + jumps * 3, c: '#cfdcff' });
      Neo.spawnParticle({
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
          phase: Neo.rng() * Math.PI * 2,
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

    Neo.enemies.forEach(enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const d = Neo.dist(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = { type: 'enemy', ref: enemy, x: enemy.x, y: enemy.y, r: enemy.r };
        bestDist = d;
      }
    });

    Neo.destructibles.forEach(prop => {
      if (prop.broken || prop.hidden || exclude.has(prop)) return;
      const d = Neo.dist(x, y, prop.x, prop.y);
      if (d < bestDist) {
        best = { type: 'prop', ref: prop, x: prop.x, y: prop.y, r: prop.r };
        bestDist = d;
      }
    });

    return best;
  }

  function castHealingZone() {
    const aoeRadiusMultiplier = Neo.getItemStats().aoeRadiusMultiplier || 1;
    Neo.hazards.push({ kind: 'healing_zone', x: Neo.player.x, y: Neo.player.y, r: 62 * aoeRadiusMultiplier, ttl: 6, healTick: 0.24, healAccum: 0, plusTick: 0.08 });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.7, ring: 30, c: '#35ff6f' });
  }

  function castFireCircle() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    Neo.hazards.push({ kind: 'fire_circle', x: Neo.player.x, y: Neo.player.y, r: 96 * aoeRadiusMultiplier, ttl: 5.2, dps: 18 * aoeDamageMultiplier, followPlayer: true });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.55, ring: 34, c: '#ff7b32' });
  }

  function castFloorLava() {
    Neo.player.lavaWalkTime = 5.8;
    Neo.player.lavaTrailTick = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 12, life: 0.7, text: 'LAVA WALK', c: '#ff9f40' });
  }

  function castLightningColumns() {
    const aoeRadiusMultiplier = Neo.getItemStats().aoeRadiusMultiplier || 1;
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const offsets = [-42, 42];
    offsets.forEach(offset => {
      const ox = Math.cos(angle + Math.PI / 2) * offset;
      const oy = Math.sin(angle + Math.PI / 2) * offset;
      Neo.hazards.push({
        kind: 'lightning_column',
        x: Neo.mouse.worldX + ox,
        y: Neo.mouse.worldY + oy,
        r: 54 * aoeRadiusMultiplier,
        ttl: 4.5,
        tick: 0,
        interval: 0.45,
        damage: 18,
      });
      Neo.spawnParticle({ x: Neo.mouse.worldX + ox, y: Neo.mouse.worldY + oy, life: 0.45, ring: 24, c: '#8dd4ff' });
    });
  }

  function castWarp() {
    const safePoint = getWarpLandingPoint();
    if (!safePoint) return;
    teleportPlayerTo(safePoint.x, safePoint.y, '#b99cff');
    Neo.player.inv = Math.max(Neo.player.inv, 0.6);
  }

  function applyEnemyImpactStun(enemy, dealt, appliedKnockback) {
    const maxHealth = Number(enemy?.max) || 0;
    const stunResistance = Math.max(0, Number(enemy?.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * Neo.HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = Neo.HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, Neo.HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, Neo.HEAVY_KNOCKBACK_STUN + Neo.clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    stunDuration *= durationMultiplier;
    if (Neo.BOSS_TYPES.has(enemy.type)) stunDuration *= Neo.HEAVY_IMPACT_BOSS_STUN_MULTIPLIER;
    enemy.stun = Math.max(enemy.stun || 0, stunDuration);
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.36, ring: enemy.r + 18, c: '#ffe66d' });
    return true;
  }

  function applyPlayerImpactStun(dealt, appliedKnockback) {
    if (!Neo.player) return false;
    const stats = Neo.getItemStats();
    const stunResistance = Math.max(0, Number(stats.stunResistance || 0));
    const thresholdMultiplier = 1 + stunResistance * 0.35;
    const durationMultiplier = Math.max(0.28, 1 - stunResistance * 0.28);
    const maxHealth = Number(Neo.player.maxHp) || 0;
    const lostHalfHealth = maxHealth > 0 && dealt >= maxHealth * Neo.HEAVY_HIT_HEALTH_RATIO * thresholdMultiplier;
    const knockbackThreshold = Neo.HEAVY_KNOCKBACK_THRESHOLD * thresholdMultiplier;
    const heavyKnockback = appliedKnockback >= knockbackThreshold;
    if (!lostHalfHealth && !heavyKnockback) return false;
    let stunDuration = 0;
    if (lostHalfHealth) stunDuration = Math.max(stunDuration, Neo.HEAVY_HIT_STUN);
    if (heavyKnockback) {
      const knockbackOverThreshold = (appliedKnockback - knockbackThreshold) / knockbackThreshold;
      stunDuration = Math.max(stunDuration, Neo.HEAVY_KNOCKBACK_STUN + Neo.clamp(knockbackOverThreshold, 0, 1) * 0.18);
    }
    Neo.player.stun = Math.max(Number(Neo.player.stun || 0), stunDuration * durationMultiplier);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - Neo.player.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.36, ring: Neo.player.r + 18, c: '#ffe66d' });
    return true;
  }

  function hitEnemy(enemy, damage, angle, knockback, color, options = {}) {
    if ((enemy?.inv || 0) > 0) return;
    const stats = Neo.getItemStats();
    const sandbox = Neo.getActiveSandboxSettings();
    const critChance = Neo.clamp((stats.critChance || 0) + Number(options.critBonus || 0), 0, 0.98);
    let dealt = options.rawDamage ? scaleRawDamageAgainstEnemy(enemy, damage) : scaleDamageAgainstEnemy(enemy, damage);
    if (sandbox) dealt = Math.max(1, Math.round(dealt * sandbox.playerDamageMultiplier));
    const isCrit = critChance > 0 && Neo.nextRandom('encounter') < critChance;
    const appliedKnockback = knockback * (stats.knockbackMultiplier || 1);
    if (isCrit) dealt = Math.round(dealt * stats.critMultiplier);
    if (!options.ignoreBarrier && (enemy.barrier || 0) > 0) {
      const absorbed = Math.min(enemy.barrier, dealt);
      enemy.barrier -= absorbed;
      dealt -= absorbed;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 20, life: 0.4, text: `BLOCK ${absorbed}`, c: '#7ed6ff' });
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
    if (!options.noCharmBuff) Neo.grantCritCharmBuff();
    Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.24, vx: Neo.rand(-30, 30, 'fx'), vy: Neo.rand(-30, 30, 'fx'), c: color });
    if (shouldBloodOnHit() && options.bloodOnHit !== false) {
      spawnBleedSpray(enemy, 1, isCrit ? 1.2 : 0.72);
    }
    Neo.spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      color: isCrit ? '#ff9f1c' : '#ff6b6b',
      size: isCrit ? 20 : 16,
    });
    if (stats.drainChance > 0 && Neo.player && Neo.player.hp < Neo.player.maxHp && Neo.nextRandom('encounter') < stats.drainChance) {
      const heal = Neo.scalePlayerHealing(1, 1);
      const beforeHp = Neo.player.hp;
      Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
      const gained = Neo.player.hp - beforeHp;
      if (gained > 0) {
        Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ff8fb4', size: 13 });
        window.achievementEvents?.emit('heal:applied', { amount: gained });
      }
    }
    if (stats.confuseRayStunChance > 0 && Neo.nextRandom('encounter') < stats.confuseRayStunChance) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.55);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STUN', c: '#ffe66d' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.28, ring: enemy.r + 12, c: '#ffe66d' });
    }
    if (stats.overstimulateStunChance > 0 && (Neo.getActiveStatusCount?.(enemy) || 0) >= 2 && Neo.nextRandom('encounter') < stats.overstimulateStunChance) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.7);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STIMULATED', c: '#ffd27d' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.28, ring: enemy.r + 12, c: '#ffd27d' });
    }
    window.achievementEvents?.emit('damage:dealt', { amount: dealt });
    if (options.bleedChance > 0 && Neo.nextRandom('encounter') < options.bleedChance) {
      applyBleed(enemy, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
    }
    if (options.fireChance > 0 && Neo.nextRandom('encounter') < options.fireChance) {
      applyFire(enemy, Number(options.fireStacks || 1), Number(options.fireDuration || 2.8));
    }
    if (options.chainLightningRadius > 0) {
      const chained = Neo.findNearestEnemy(enemy.x, enemy.y, options.chainLightningRadius, new Set([enemy]));
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
    const stats = Neo.getItemStats();
    const chains = stats.beamChainTargets || 0;
    if (chains <= 0) return;
    const visited = new Set([primaryEnemy]);
    let source = primaryEnemy;
    for (let index = 0; index < chains; index += 1) {
      const nextEnemy = Neo.findNearestEnemy(source.x, source.y, 145, visited);
      if (!nextEnemy) break;
      visited.add(nextEnemy);
      const chainDamage = Math.max(1, Math.round(baseDamage * (stats.beamChainDamageMultiplier || 0.6)));
      hitEnemy(nextEnemy, chainDamage, Math.atan2(nextEnemy.y - source.y, nextEnemy.x - source.x), 55, color);
      Neo.spawnParticle({ x: (source.x + nextEnemy.x) / 2, y: (source.y + nextEnemy.y) / 2, life: 0.22, c: '#d890ff' });
      source = nextEnemy;
    }
  }

  function applyBleed(enemy, stacks, duration) {
    if (!enemy) return;
    const beforeStacks = Neo.getStatusStacks(enemy, 'bleed');
    Neo.applyStatus(enemy, 'bleed', stacks, duration);
    const afterStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (afterStacks > beforeStacks) {
      enemy.bleedFlash = 0.34;
      spawnBleedSpray(enemy, afterStacks - beforeStacks, 1.7);
    }
  }

  function applyFire(entity, stacks, duration) {
    Neo.applyStatus(entity, 'fire', stacks, duration);
  }

  function applyPoison(entity, stacks, duration) {
    Neo.applyStatus(entity, 'poison', stacks, duration);
  }

  function applyDarkDrain(entity, stacks, duration) {
    Neo.applyStatus(entity, 'dark_drain', stacks, duration);
  }

  function applyStatusInRadius(x, y, radius, statusKey, stacks, duration, sourceEnemy = null) {
    const visitEnemy = enemy => {
      if (!enemy) return;
      if (sourceEnemy && enemy === sourceEnemy) return;
      if (Neo.dist(x, y, enemy.x, enemy.y) > radius + enemy.r) return;
      Neo.applyStatus(enemy, statusKey, stacks, duration);
    };
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(x, y, radius + 80, visitEnemy, { excludeEnemy: sourceEnemy });
    } else {
      Neo.enemies.forEach(visitEnemy);
    }
  }

  function spawnBleedSpray(enemy, stacks = 1, intensity = 1) {
    if (!enemy) return;
    const bloodMult = getBloodMultiplier();
    const count = Neo.clamp(Math.ceil(Number(stacks || 1) * Number(intensity || 1) * bloodMult) + 1, 2, Math.ceil(9 * bloodMult));
    const radius = Math.max(8, Number(enemy.r || 12));
    for (let index = 0; index < count; index += 1) {
      const angle = Neo.rand(Math.PI * 2, 0, 'fx');
      const force = Neo.rand(125, 35, 'fx') * (0.75 + Math.min(6, stacks) * 0.07);
      Neo.spawnParticle({
        x: enemy.x + Math.cos(angle) * Neo.rand(radius * 0.55, 1, 'fx'),
        y: enemy.y + Math.sin(angle) * Neo.rand(radius * 0.45, 1, 'fx'),
        life: Neo.rand(0.52, 0.22, 'fx'),
        vx: Math.cos(angle) * force + Neo.rand(24, -24, 'fx'),
        vy: Math.sin(angle) * force - Neo.rand(52, 12, 'fx'),
        c: Neo.BLEED_BLOOD_COLORS[Neo.irand(0, Neo.BLEED_BLOOD_COLORS.length - 1, 'fx')],
        blood: true,
        size: Neo.rand(4.2, 2.1, 'fx'),
      });
    }
  }

  function migrateEnemyState(enemy) {
    if (!enemy || typeof enemy !== 'object') return enemy;
    Neo.ensureStatuses(enemy);
    if (enemy.elite && !enemy.eliteDurabilityV2) {
      enemy.max = Math.max(1, Math.round(Number(enemy.max || enemy.hp || 1) * 2));
      enemy.hp = Math.max(1, Math.round(Number(enemy.hp || enemy.max) * 2));
      enemy.defenseMultiplier = Math.max(2, Number(enemy.defenseMultiplier || 1));
      enemy.eliteDurabilityV2 = true;
    }
    enemy.bleedImmune = !!enemy.bleedImmune;
    enemy.fireImmune = !!enemy.fireImmune;
    enemy.poisonImmune = !!enemy.poisonImmune;
    enemy.dark_drainImmune = !!enemy.dark_drainImmune;
    if (Number(enemy.bleed || 0) > 0 || Number(enemy.bleedT || 0) > 0) {
      applyBleed(enemy, Number(enemy.bleed || 0), Number(enemy.bleedT || 0));
      Neo.getStatusState(enemy, 'bleed').tick = Number(enemy.bleedTick || 0);
    }
    delete enemy.bleed;
    delete enemy.bleedT;
    delete enemy.bleedTick;
    return enemy;
  }

  function tickEnemyStatus(enemy, key, dt, config) {
    const state = Neo.getStatusState(enemy, key);
    if (state.stacks <= 0) return false;
    if (enemy[`${key}Immune`]) {
      Neo.clearStatus(enemy, key);
      return false;
    }
    state.duration -= dt;
    state.tick -= dt;
    if (state.tick <= 0) {
      state.tick = config.interval;
      const damage = scaleRawDamageAgainstEnemy(enemy, Math.max(1, Math.round(config.damage(state.stacks))));
      enemy.hp -= damage;
      Neo.spawnDamagePopup(enemy.x, enemy.y - 10, damage, { color: config.color, size: 15 });
      if (config.particleColor) {
        Neo.spawnParticle({ x: enemy.x + Neo.rand(-8, 8), y: enemy.y + Neo.rand(-8, 8), life: 0.25, c: config.particleColor });
      }
      if (key === 'bleed') spawnBleedSpray(enemy, state.stacks, 0.7);
      if (config.healScale > 0 && Neo.player && Neo.player.hp < Neo.player.maxHp) {
        const heal = Neo.scalePlayerHealing(damage * config.healScale);
        const beforeHp = Neo.player.hp;
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        const gained = Neo.player.hp - beforeHp;
        if (gained > 0.2) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-8, 8), Neo.player.y - 22, gained, { color: config.color });
      }
      if (enemy.hp <= 0) {
        onEnemyDie(enemy);
        return true;
      }
    }
    if (state.duration <= 0) Neo.clearStatus(enemy, key);
    return false;
  }

  function updateEnemyStatuses(enemy, dt) {
    if (enemy.bleedFlash > 0) enemy.bleedFlash = Math.max(0, enemy.bleedFlash - dt);
    const bleedStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (tickEnemyStatus(enemy, 'bleed', dt, {
      interval: 0.5,
      damage: stacks => scaleBleedDamageAgainstEnemy(enemy, stacks),
      color: Neo.STATUS_STYLES.bleed.textColor,
      particleColor: Neo.STATUS_STYLES.bleed.color,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    if (tickEnemyStatus(enemy, 'fire', dt, {
      interval: 0.45,
      damage: stacks => scaleDamageAgainstEnemy(enemy, 1.5 + stacks * 1.8),
      color: Neo.STATUS_STYLES.fire.textColor,
      particleColor: Neo.STATUS_STYLES.fire.color,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    if (tickEnemyStatus(enemy, 'poison', dt, {
      interval: 0.7,
      damage: stacks => Math.max(1, enemy.max * (0.008 * stacks)),
      color: Neo.STATUS_STYLES.poison.textColor,
      particleColor: Neo.STATUS_STYLES.poison.color,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    tickEnemyStatus(enemy, 'dark_drain', dt, {
      interval: 0.6,
      damage: stacks => scaleDamageAgainstEnemy(enemy, (1 + stacks * 2) * 0.1),
      color: Neo.STATUS_STYLES.dark_drain.textColor,
      particleColor: Neo.STATUS_STYLES.dark_drain.color,
      healScale: 0.35,
    });
    const slowState = Neo.getStatusState(enemy, 'slow');
    if (slowState.stacks > 0) {
      slowState.duration -= dt;
      slowState.tick -= dt;
      if (slowState.tick <= 0) {
        slowState.tick = 0.32;
        if (Neo.nextRandom('fx') < 0.32) {
          Neo.spawnParticle({ x: enemy.x + Neo.rand(-7, 7), y: enemy.y + Neo.rand(-7, 7), life: 0.22, c: Neo.STATUS_STYLES.slow.color });
        }
      }
      if (slowState.duration <= 0) Neo.clearStatus(enemy, 'slow');
    }
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
    const bias = (Neo.nextRandom('encounter') - 0.5) * 2 * maxError;
    enemy.beamAimBias = bias;
    return bias;
  }

  function aimEnemyBeam(enemy, dt, turnRate) {
    if (!Neo.player || turnRate <= 0) return;
    const targetAngle = Math.atan2(Neo.player.y - enemy.y, Neo.player.x - enemy.x) + Number(enemy.beamAimBias || 0);
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
      damageSource = null,
    } = config;
    enemy.beamTime -= dt;
    enemy.beamTick -= dt;
    enemy.vx *= speedDamp;
    enemy.vy *= speedDamp;
    if (turnRate > 0) aimEnemyBeam(enemy, dt, turnRate * 0.55);
    if (typeof onTick === 'function') onTick(enemy, dt);
    if (enemy.beamTick <= 0) {
      enemy.beamTick = tick;
      const beamPath = Neo.buildRicochetBeamPath(enemy.x, enemy.y, enemy.beamAngle, range, Neo.getEnemyBeamBounceCount(enemy));
      const hitSegment = Neo.beamPathHitsCircle(beamPath, Neo.player.x, Neo.player.y, Neo.player.r + 5);
      if (hitSegment) {
        const source = getEnemyBeamDamageSource(enemy, damageSource);
        Neo.damagePlayer(damage, hitSegment.angle, knockback, source.label, { sourceKey: source.key });
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
      : Neo.rand(Math.PI * 2, 0, 'fx');
    const boss = Neo.isBossType(enemy.type);
    Neo.deadBodies.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(direction) * (22 + speed * 0.16),
      vy: Math.sin(direction) * (22 + speed * 0.16),
      r: enemy.r,
      spriteKey: Neo.getEnemySpriteKey(enemy),
      type: enemy.type,
      elite: !!enemy.elite,
      age: 0,
      fallTime: boss ? Neo.CORPSE_FALL_TIME * 1.35 : Neo.CORPSE_FALL_TIME,
      fadeStart: boss ? Neo.CORPSE_FADE_START * 1.8 : Neo.CORPSE_FADE_START,
      life: boss ? Neo.CORPSE_LIFETIME * 1.9 : Neo.CORPSE_LIFETIME,
      angle: direction + Math.PI / 2,
      fallAngle: Neo.rand(0.95, -0.95, 'fx') + (enemy.elite ? 0.25 : 0),
      face: Neo.getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || direction),
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
      Neo.triggerGodPhase(enemy, 2, 'DIVINE REBIRTH');
      Neo.playGodDialogue(2);
      Neo.spawnHealPopup(enemy.x, enemy.y - 54, enemy.hp, { color: '#79f7bf' });
      return;
    }
    if (enemy.dead) return;
    enemy.dead = true;

    const index = Neo.enemies.indexOf(enemy);
    if (index >= 0) Neo.enemies.splice(index, 1);
    const isTutorialDummy = !!enemy.tutorialDummy;
    spawnEnemyCorpse(enemy);
    const itemStats = Neo.getItemStats();
    if (Neo.player) Neo.player.kills = Math.max(0, Number(Neo.player.kills || 0)) + 1;
    window.achievementEvents?.emit('enemy:killed');
    if (Neo.player?.keenEyeReady) {
      Neo.triggerKeenEyeBuff();
      Neo.consumeCharge('keen_eye');
    }
    if (Neo.player?.chronoSpringReady) {
      Neo.triggerChronoSpringBuff();
      Neo.consumeCharge('chrono_spring');
    }
    if (itemStats.graveZoneChance > 0 && Neo.nextRandom('encounter') < itemStats.graveZoneChance) {
      const moveSpeed = itemStats.moveSpeedMultiplier || 1;
      Neo.hazards.push({
        kind: 'grave_zone',
        x: enemy.x,
        y: enemy.y,
        r: 118,
        ttl: 2,
        pushPower: 340 * moveSpeed,
        moveSpeed,
        source: 'grave_zone',
      });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.45, ring: 118, c: '#c9b3ff' });
    }

    const bloodMult = getBloodMultiplier();
    const deathDust = Math.ceil((enemy.elite ? 6 : Neo.isBossType(enemy.type) ? 9 : 4) * bloodMult);
    for (let burst = 0; burst < deathDust; burst += 1) {
      const angle = Neo.rand(Math.PI * 2, 0, 'fx');
      Neo.spawnParticle({
        x: enemy.x + Math.cos(angle) * Neo.rand(enemy.r, 2, 'fx'),
        y: enemy.y + Math.sin(angle) * Neo.rand(enemy.r, 2, 'fx'),
        life: Neo.rand(0.34, 0.16, 'fx'),
        vx: Math.cos(angle) * Neo.rand(42, 12, 'fx'),
        vy: Math.sin(angle) * Neo.rand(42, 12, 'fx'),
        c: enemy.elite ? '#b97333' : enemy.type === 'god' ? '#f2ecff' : '#7b1a22',
      });
    }

    const enemyLootRandom = Neo.createRandomFromSeed(enemy.lootSeed || `${Neo.getFloorSeed()}|enemy:fallback:${enemy.type}:${Math.round(enemy.x)},${Math.round(enemy.y)}|loot`);
    if (isTutorialDummy) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 18, life: 0.85, text: 'RELIC DROPPED', c: '#8dd4ff' });
    } else {
      dropCoins(enemy.x, enemy.y, Neo.isBossType(enemy.type) ? 40 : enemy.elite ? 10 : 5);
      grantXp(Neo.isBossType(enemy.type) ? 40 : enemy.elite ? 12 : 6);
      window.achievementEvents?.emit('charge:kill');
    }

    const itemDropChanceBonus = Number(Neo.getItemStats?.()?.itemDropChanceBonus || 0);
    if (!isTutorialDummy && enemy.elite && enemyLootRandom() < Neo.clamp(0.18 + itemDropChanceBonus, 0, 0.65)) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, random: enemyLootRandom }) });
    } else if (!isTutorialDummy && !enemy.elite && itemDropChanceBonus > 0 && enemyLootRandom() < Neo.clamp(itemDropChanceBonus, 0, 0.35)) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemyLootRandom() < 0.1) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (enemy.type === 'mooggy') {
      const defeats = Math.max(0, Number(Neo.metaProgress.mooggyDefeats || 0)) + 1;
      Neo.metaProgress.mooggyDefeats = defeats;
      dropCoins(enemy.x, enemy.y, 35 + defeats * 5);
      grantXp(24 + Neo.floor * 4);
      if (defeats >= 3 && !Neo.metaProgress.unlockedCharacters.includes('mooggy')) {
        Neo.metaProgress.unlockedCharacters.push('mooggy');
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 34, life: 2.2, text: 'MOOGGY UNLOCKED!', c: '#ff3348' });
      } else {
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 28, life: 1.5, text: `MOOGGY ${defeats}/3`, c: '#ff3348' });
      }
      Neo.persistMetaSoon();
      Neo.refreshMenuState();
    }

    if (enemy.type === 'god') {
      Neo.metaProgress.godsKilled = Number(Neo.metaProgress.godsKilled || 0) + 1;
      window.achievementEvents?.emit('god:killed');
      if (!Neo.metaProgress.unlockedCharacters.includes('granialla')) Neo.metaProgress.unlockedCharacters.push('granialla');
      if (Neo.gameMode === 'boss_rush') {
        Neo.currentRoom.cleared = true;
        Neo.bossRushActive = false;
        Neo.onBossRushBossDefeated();
        return;
      }
      Neo.currentRoom.cleared = true;
      // After defeating god: offer the choice — cash in (win) or loop; Endless Descent adds a third option
      if (Neo.hasLegacy('endless_descent')) {
        Neo.pickups.push({ x: Neo.ROOM_W / 2 - 200, y: Neo.ROOM_H / 2, type: 'crown' });
        Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, type: 'descend' });
        Neo.pickups.push({ x: Neo.ROOM_W / 2 + 200, y: Neo.ROOM_H / 2, type: 'returnGate' });
      } else {
        Neo.pickups.push({ x: Neo.ROOM_W / 2 - 120, y: Neo.ROOM_H / 2, type: 'crown' });
        Neo.pickups.push({ x: Neo.ROOM_W / 2 + 120, y: Neo.ROOM_H / 2, type: 'returnGate' });
      }
      Neo.updateObjective();
      Neo.refreshMenuState();
      Neo.scheduleRunSave();
      return;
    }

    if (enemy.type === 'bulk_golem' && enemy.splitReady) {
      //Golem Dies 

      Neo.sayAtPosition(enemy.x, enemy.y, 'I AM NOT DONE.', { speaker: 'BULK GOLEM', tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
      const leftSpawn = Neo.findSafeEnemySpawnPoint(enemy.x - 70, enemy.y, 15);
      const rightSpawn = Neo.findSafeEnemySpawnPoint(enemy.x + 70, enemy.y, 15);

      if (leftSpawn) {
        const left = Neo.spawnEnemy('golem', leftSpawn.x, leftSpawn.y, true);
        left.spawnedFromBulk = true;
        left.hp = Math.round(left.max * 1.6);
        left.max = left.hp;
        left.dmg = Math.round(left.dmg * 1.35);
      }
      if (rightSpawn) {
        const right = Neo.spawnEnemy('golem', rightSpawn.x, rightSpawn.y, true);
        right.spawnedFromBulk = true;
        right.hp = Math.round(right.max * 1.6);
        right.max = right.hp;
        right.dmg = Math.round(right.dmg * 1.35);
      }


    }

    if (enemy.type === 'mirror_knight' && Neo.currentRoom?.type === 'challenge') {
      Neo.completeChallengeTrial('MIRROR BROKEN');
    }

    if (enemy.type === 'bowman_bane' && Neo.currentRoom?.secret && Neo.currentRoom?.secretKind === 'bowman_bane') {
      Neo.currentRoom.cleared = true;
      Neo.pickups = Neo.pickups.filter(pickup => pickup.type !== 'secret_boss_chest');
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'secret_boss_chest' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 40, life: 1.4, text: "BANE DEFEATED", c: '#c9aaff' });
      Neo.updateObjective();
      Neo.scheduleRunSave();
    }

    if (enemy.type === 'rival') {
      const rival = enemy.rivalData;
      if (rival) {
        rival.dead = true;
        if (Neo.player) Neo.player.rivalReputation = Math.max(0, Number(Neo.player.rivalReputation || 0)) + 1;
        window.achievementEvents?.emit('rival:killed');
        rival.loot.forEach(item => {
          if (item.type === 'item' && item.key) {
            Neo.pickups.push({ x: enemy.x + Neo.rand(-22, 22, 'loot'), y: enemy.y + Neo.rand(-14, 14, 'loot'), type: 'item', key: item.key });
          } else if (item.type === 'potion') {
            Neo.pickups.push({ x: enemy.x + Neo.rand(-22, 22, 'loot'), y: enemy.y + Neo.rand(-14, 14, 'loot'), type: 'potion' });
          }
        });
        if (Neo.nextRandom('loot') < 0.05) {
          Neo.pickups.push({ x: enemy.x, y: enemy.y + 10, type: 'item', key: 'veggys_pendant' });
        }
        const rivalBase = 18 + Neo.floor * 4 + rival.loot.length * 8;
        const bonus = Neo.hasLegacy('rival_bounty') ? Math.round(rivalBase * 1.5) : rivalBase;
        dropCoins(enemy.x, enemy.y, bonus);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 26, life: 2.0, text: `${rival.name.toUpperCase()} DEFEATED!`, c: rival.color });
        Neo.sayAtPosition(enemy.x, enemy.y, rival.deathLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
        grantXp(20 + Neo.floor * 3);
      }
      const rivalIdx = Neo.enemies.indexOf(enemy);
      if (rivalIdx >= 0) Neo.enemies.splice(rivalIdx, 1);
      if (Neo.player) Neo.player.kills = Math.max(0, Number(Neo.player.kills || 0)) + 1;
    }
    if (enemy.type === 'rival') return;

    if (Neo.enemies.filter(e => e.type !== 'rival').length === 0 && !Neo.currentRoom.cleared) {
      if (Neo.currentRoom.type === 'challenge') {
        Neo.updateObjective();
        return;
      }
      Neo.currentRoom.cleared = true;
      if ((Neo.currentRoom.type === 'ladder' || Neo.currentRoom.type === 'boss') && Neo.gameMode !== 'endless' && Neo.gameMode !== 'boss_rush') {
        Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, type: 'ladder' });
      }
      if (Neo.gameMode === 'endless' && Neo.endlessWaveActive) {
        Neo.endlessWaveActive = false;
        onEndlessWaveCleared();
      }
      if (Neo.gameMode === 'boss_rush' && Neo.bossRushActive) {
        Neo.bossRushActive = false;
        Neo.onBossRushBossDefeated();
      }
      Neo.updateObjective();
      Neo.scheduleRunSave();
    }
  }

  function onEndlessWaveCleared() {
    Neo.endlessWave += 1;
    if (Neo.ui.endlessWaveNum) Neo.ui.endlessWaveNum.textContent = Neo.endlessWave;
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2;
    const rewardRandom = Neo.createScopedRandom(`endless:wave:${Neo.endlessWave}:reward`);
    Neo.spawnParticle({ x: cx, y: cy - 40, life: 1.4, text: `WAVE ${Neo.endlessWave} CLEARED`, c: '#78d7ff' });
    Neo.pickups.push({ x: cx - 60, y: cy, type: 'item', key: rollItemDrop({ elite: Neo.endlessWave % 3 === 0, random: rewardRandom }) });
    Neo.pickups.push({ x: cx + 60, y: cy, type: 'potion' });
    if (Neo.endlessWave % 5 === 0) {
      Neo.pickups.push({ x: cx, y: cy + 50, type: 'item', key: rollItemDrop({ elite: true, random: rewardRandom }) });
    }
    dropCoins(cx, cy - 20, 30 + Neo.endlessWave * 8);
    grantXp(20 + Neo.endlessWave * 4);
    const delay = Neo.endlessWave <= 2 ? 4 : Neo.endlessWave <= 5 ? 3 : 2;
    setTimeout(() => {
      if (Neo.gameMode !== 'endless' || Neo.gameState !== 'play') return;
      Neo.currentRoom.cleared = false;
      Neo.endlessWaveActive = true;
      const waveSize = Math.min(4 + Neo.endlessWave + Math.floor(Neo.endlessWave / 3), 18);
      Neo.spawnWave(waveSize, 'combat');
      Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40, life: 1.1, text: `WAVE ${Neo.endlessWave + 1}`, c: '#ff8b8b' });
    }, delay * 1000);
  }

  function dropCoins(x, y, amount) {
    const scaledAmount = Math.max(1, Math.round(Number(amount || 0) * Neo.getRunDifficultyScalars().coinRewardMultiplier));
    const chunks = Math.max(1, Math.ceil(scaledAmount / 4));
    for (let index = 0; index < chunks; index += 1) {
      Neo.pickups.push({
        x: x + Neo.rand(-18, 18, 'loot'),
        y: y + Neo.rand(-18, 18, 'loot'),
        type: 'coin',
        value: Math.ceil(scaledAmount / chunks),
      });
    }
  }

  function rollItemDrop(options = {}) {
    const sandbox = Neo.getActiveSandboxSettings();
    if (sandbox) {
      const baseEntries = options.elite
        ? Neo.ITEM_DROP_WEIGHTS.map(([key, weight]) => [key, weight + (key !== 'neo_knife' ? 4 : 0)])
        : Neo.ITEM_DROP_WEIGHTS;
      const filteredEntries = baseEntries.filter(([key]) => sandbox.allowedItems.includes(key));
      if (filteredEntries.length > 0) {
        return Neo.rollFromWeightTable(Neo.buildWeightTable(filteredEntries), options.stream || 'loot', options.random);
      }
    }
    const table = options.elite ? Neo.ELITE_ITEM_DROP_TABLE : Neo.ITEM_DROP_TABLE;
    return Neo.rollFromWeightTable(table, options.stream || 'loot', options.random);
  }

  function grantXp(amount) {
    const stats = Neo.getItemStats();
    const gained = Math.max(1, Math.round(amount * Neo.getRunDifficultyScalars().xpRewardMultiplier * (stats.xpGainMultiplier || 1)));
    Neo.player.xp += gained;
    while (Neo.player.xp >= Neo.player.xpToNext) {
      Neo.player.xp -= Neo.player.xpToNext;
      levelUp();
    }
  }

  function levelUp() {
    Neo.player.level += 1;
    window.achievementEvents?.emit('player:leveled', { level: Neo.player.level });
    Neo.player.xpToNext = Math.round(Neo.player.xpToNext * 1.22);
    Neo.player.maxHp += 15;
    Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + 15);
    Neo.player.attackPower += 3;
    Neo.player.attackSpeed += 0.01;
    Neo.markInventoryPanelDirty();
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.9, text: `LV ${Neo.player.level}`, c: '#7dff9e' });
  }

  function collectItem(itemKey) {
    if (Neo.isChallengeActive('no_items')) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 0.85, text: 'NO ITEMS', c: '#ff8a98' });
      return;
    }
    const item = Neo.itemRegistry.get(itemKey);
    if (!item) return;
    Neo.player.items[itemKey] = Neo.getItemCount(itemKey) + 1;
    if (Neo.isFirstRunTutorialActive()) Neo.tutorialState.gotRelic = true;
    Neo.addToEquipmentSlots?.(itemKey);
    Neo.markInventoryPanelDirty();
    Neo.pushItemNotification(itemKey, 1);
    const totalItems = Object.values(Neo.player.items).reduce((s, v) => s + Number(v || 0), 0);
    window.achievementEvents?.emit('item:collected', { totalItems });

    if (itemKey === 'jesters_dice') {
      Neo.floorSkipPending += 3;
      const bonusItemCounts = {};
      for (let index = 0; index < 10; index += 1) {
        const rewardPool = Neo.ITEM_KEYS.filter(key => key !== 'jesters_dice');
        const key = rewardPool[Neo.irand(0, rewardPool.length - 1, 'loot')];
        Neo.player.items[key] = Neo.getItemCount(key) + 1;
        bonusItemCounts[key] = (bonusItemCounts[key] || 0) + 1;
        if (key === 'titan_heart') {
          Neo.player.maxHp = Math.max(120, Math.round(Neo.player.maxHp * 1.08));
          Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Neo.player.hp * 1.08));
        }
        if (key === 'wizards_paw') {
          Neo.openWizardPawSelection();
        }
        if (key === 'extra_battery') {
          Neo.openExtraBatterySelection();
        }
      }
      Object.entries(bonusItemCounts).forEach(([key, amount]) => {
        Neo.pushItemNotification(key, Number(amount), '(Jester bonus)');
      });
    } else if (itemKey === 'wizards_paw') {
      Neo.openWizardPawSelection();
    } else if (itemKey === 'extra_battery') {
      Neo.openExtraBatterySelection();
    }

    if (itemKey === 'titan_heart') {
      Neo.player.maxHp = Math.max(120, Math.round(Neo.player.maxHp * 1.08));
      Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Neo.player.hp * 1.08));
    }

    if (!Neo.metaProgress.unlockedItems.includes(itemKey)) {
      Neo.metaProgress.unlockedItems.push(itemKey);
      Neo.persistMetaSoon();
      Neo.refreshMenuState();
    }

    updateItemUI();

    if (Neo.ITEM_KEYS.every(key => Neo.getItemCount(key) > 0) && Neo.godTimer <= 0) {
      Neo.godTimer = 12;
      for (let index = 0; index < 40; index += 1) {
        Neo.spawnParticle({
          x: Neo.player.x,
          y: Neo.player.y,
          life: 1.1,
          vx: Neo.rand(-220, 220),
          vy: Neo.rand(-220, 220),
          c: `hsl(${index * 9},100%,60%)`,
        });
      }
    }
  }

  function updateItemUI() {
    Neo.uiController.setItemStatus(Neo.player?.items || {});
  }

  // Expose on Neo
  Neo.scaleDamageAgainstEnemy = scaleDamageAgainstEnemy;
  Neo.getEnemyBleedResistance = getEnemyBleedResistance;
  Neo.scaleBleedDamageAgainstEnemy = scaleBleedDamageAgainstEnemy;
  Neo.getPlayerBaseDamage = getPlayerBaseDamage;
  Neo.getEquippedMove = getEquippedMove;
  Neo.getEquippedWeapon = getEquippedWeapon;
  Neo.getWeaponBaseCooldown = getWeaponBaseCooldown;
  Neo.spawnWeaponProjectile = spawnWeaponProjectile;
  Neo.fireWeaponSweep = fireWeaponSweep;
  Neo.tryWeaponAttack = tryWeaponAttack;
  Neo.tryMelee = tryMelee;
  Neo.fireLazerGlassesTick = fireLazerGlassesTick;
  Neo.updateWeaponSystems = updateWeaponSystems;
  Neo.tryLaser = tryLaser;
  Neo.endActiveLaser = endActiveLaser;
  Neo.tickTurtleWaveHpDrain = tickTurtleWaveHpDrain;
  Neo.updatePlayerLaser = updatePlayerLaser;
  Neo.tryUsePotion = tryUsePotion;
  Neo.trySmash = trySmash;
  Neo.tryDash = tryDash;
  Neo.castDashBurst = castDashBurst;
  Neo.cancelCowardsWayOnAttack = cancelCowardsWayOnAttack;
  Neo.findSafePointNearTarget = findSafePointNearTarget;
  Neo.getWarpLandingPoint = getWarpLandingPoint;
  Neo.teleportPlayerTo = teleportPlayerTo;
  Neo.castNimrodStomp = castNimrodStomp;
  Neo.castCowardsWay = castCowardsWay;
  Neo.castZipLightning = castZipLightning;
  Neo.castNarwalFight = castNarwalFight;
  Neo.castKickyKick = castKickyKick;
  Neo.castFlyingUntouchable = castFlyingUntouchable;
  Neo.applyResponsiveVelocity = applyResponsiveVelocity;
  Neo.spawnPlayerDiskBurst = spawnPlayerDiskBurst;
  Neo.spawnFireballs = spawnFireballs;
  Neo.castChaosBurst = castChaosBurst;
  Neo.castBladeOfJustice = castBladeOfJustice;
  Neo.castSmiteChain = castSmiteChain;
  Neo.findNearestSmiteTarget = findNearestSmiteTarget;
  Neo.castHealingZone = castHealingZone;
  Neo.castFireCircle = castFireCircle;
  Neo.castFloorLava = castFloorLava;
  Neo.castLightningColumns = castLightningColumns;
  Neo.castWarp = castWarp;
  Neo.applyEnemyImpactStun = applyEnemyImpactStun;
  Neo.applyPlayerImpactStun = applyPlayerImpactStun;
  Neo.hitEnemy = hitEnemy;
  Neo.chainBeamHit = chainBeamHit;
  Neo.applyBleed = applyBleed;
  Neo.applyFire = applyFire;
  Neo.applyPoison = applyPoison;
  Neo.applyDarkDrain = applyDarkDrain;
  Neo.applyStatusInRadius = applyStatusInRadius;
  Neo.spawnBleedSpray = spawnBleedSpray;
  Neo.migrateEnemyState = migrateEnemyState;
  Neo.tickEnemyStatus = tickEnemyStatus;
  Neo.updateEnemyStatuses = updateEnemyStatuses;
  Neo.normalizeAngle = normalizeAngle;
  Neo.turnAngleToward = turnAngleToward;
  Neo.rollEnemyBeamBias = rollEnemyBeamBias;
  Neo.aimEnemyBeam = aimEnemyBeam;
  Neo.tickEnemyBeam = tickEnemyBeam;
  Neo.spawnEnemyCorpse = spawnEnemyCorpse;
  Neo.onEnemyDie = onEnemyDie;
  Neo.onEndlessWaveCleared = onEndlessWaveCleared;
  Neo.dropCoins = dropCoins;
  Neo.rollItemDrop = rollItemDrop;
  Neo.grantXp = grantXp;
  Neo.levelUp = levelUp;
  Neo.collectItem = collectItem;
  Neo.updateItemUI = updateItemUI;
