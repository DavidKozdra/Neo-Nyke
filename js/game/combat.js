// combat.js — standalone IIFE. Player attacks, hit resolution, status effects, XP/loot.
  const COMBAT_SPATIAL_PADDING = 180;
  const DEFAULT_DAMAGE_OPTIONS = {};
  const NO_BLEED_BONUS_DAMAGE_OPTIONS = { applyBleedBonus: false };
  const MOVING_GUN_PENALTIES = {
    magenta_degale: { maxSpread: 0.18, recoilBonus: 1.4 },
    magenta_p90: { maxSpread: 0.14, recoilBonus: 1 },
  };

  function distanceSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function isWithinRadiusSq(x, y, target, radius, extra = 0) {
    const reach = radius + Number(target?.r || 0) + extra;
    return distanceSq(x, y, target.x, target.y) <= reach * reach;
  }

  function angleDifferenceAbs(targetAngle, sourceAngle) {
    return Math.abs(Math.atan2(Math.sin(targetAngle - sourceAngle), Math.cos(targetAngle - sourceAngle)));
  }

  function forEachEnemyNearPlayer(radius, visitor) {
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(Neo.player.x, Neo.player.y, radius + COMBAT_SPATIAL_PADDING, visitor);
      return;
    }
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (enemy) visitor(enemy);
    }
  }

  function forEachDestructibleNearPlayer(radius, visitor) {
    if (typeof Neo.forEachDestructibleNearCircle === 'function') {
      Neo.forEachDestructibleNearCircle(Neo.player.x, Neo.player.y, radius + COMBAT_SPATIAL_PADDING, visitor);
      return;
    }
    Neo.destructibles.forEach(prop => {
      if (prop) visitor(prop);
    });
  }

  function forEachEnemyNearBeamPath(path, padding, visitor) {
    const bounds = Neo.getBeamPathBounds(path);
    if (bounds && typeof Neo.forEachEnemyNearRect === 'function') {
      Neo.forEachEnemyNearRect(bounds.left, bounds.top, bounds.width, bounds.height, visitor, { padding });
      return;
    }
    for (let index = Neo.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = Neo.enemies[index];
      if (enemy) visitor(enemy);
    }
  }

  function forEachDestructibleNearBeamPath(path, padding, visitor) {
    const bounds = Neo.getBeamPathBounds(path);
    if (bounds && typeof Neo.forEachDestructibleNearRect === 'function') {
      Neo.forEachDestructibleNearRect(bounds.left, bounds.top, bounds.width, bounds.height, visitor, { padding });
      return;
    }
    Neo.destructibles.forEach(prop => {
      if (prop) visitor(prop);
    });
  }

  function pickRandomEnemies(limit) {
    const count = Math.max(0, Math.floor(Number(limit || 0)));
    if (count <= 0) return [];
    const picked = [];
    let seen = 0;
    for (let index = 0; index < Neo.enemies.length; index += 1) {
      const enemy = Neo.enemies[index];
      if (!enemy) continue;
      seen += 1;
      if (picked.length < count) {
        picked.push(enemy);
        continue;
      }
      const replaceIndex = Math.floor(Neo.rng() * seen);
      if (replaceIndex < count) picked[replaceIndex] = enemy;
    }
    return picked;
  }

  // Current loop number (1-based). runLoopIndex counts completed loops, so this
  // remains accurate even when floor skips make cumulative floor depth lag.
  function getCurrentLoopNumber() {
    if (Number.isFinite(Number(Neo.runLoopIndex))) {
      return Math.max(1, Math.floor(Number(Neo.runLoopIndex)) + 1);
    }
    const depth = Neo.getProgressionDepth ? Neo.getProgressionDepth() : Math.max(1, Number(Neo.floor) || 1);
    return Math.max(1, Math.floor((depth - 1) / Neo.MAX_FLOOR) + 1);
  }

  // Damage taken multiplier for an enemy. Elites always take 5% less damage.
  // Difficulties above Hard can also add damage reduction per completed loop;
  // the rate lives on the difficulty definition so Custom remains unaffected.
  function getEnemyDamageTakenMultiplier(enemy) {
    const eliteFactor = enemy?.elite ? 0.95 : 1;
    const reductionPerLoop = Math.max(0, Number(Neo.getDifficultyDef?.()?.enemyLoopDamageReduction || 0));
    const loopReduction = Math.min(0.95, (getCurrentLoopNumber() - 1) * reductionPerLoop);
    return eliteFactor * (1 - loopReduction);
  }

  function scaleDamageAgainstEnemy(enemy, damage, options = {}, cachedStats = null) {
    const stats = cachedStats || options.stats || Neo.getItemStats();
    const applyBleedBonus = options.applyBleedBonus !== false;
    const defenseMultiplier = Math.max(1, Number(enemy?.defenseMultiplier || 1));
    const damageTakenMultiplier = getEnemyDamageTakenMultiplier(enemy);
    const characterMultiplier = Neo.getCharacterDef().damageMultiplier || 1;
    // Pendant of Kronos: flat +1%/god-item damage everywhere, plus +2%/stack
    // against bosses (boss types, miniBosses, and the god enemy).
    const isBoss = Neo.isBossType?.(enemy?.type) || enemy?.type === 'god' || !!enemy?.miniBoss;
    const kronosMultiplier = (stats.kronosDamageMultiplier || 1)
      * (isBoss ? (stats.kronosBossDamageMultiplier || 1) : 1);
    const powered = (damage + (Neo.player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * kronosMultiplier
      * (Neo.isChallengeActive('glass_cannon') ? 1.25 : 1);
    if (applyBleedBonus && Neo.getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.max(1, Math.round((powered * stats.bleedDamageMultiplier * damageTakenMultiplier) / defenseMultiplier));
    }
    return Math.max(1, Math.round((powered * damageTakenMultiplier) / defenseMultiplier));
  }

  function scaleRawDamageAgainstEnemy(enemy, damage) {
    const defenseMultiplier = Math.max(1, Number(enemy?.defenseMultiplier || 1));
    const damageTakenMultiplier = getEnemyDamageTakenMultiplier(enemy);
    return Math.max(1, Math.round((Number(damage || 0) * damageTakenMultiplier) / defenseMultiplier));
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

  // Convert a landed enemy hit into game feel: screen trauma + a directional
  // camera kick away from the impact. Magnitude scales with how big
  // the hit is vs the target's max HP, so chip damage stays calm and heavy
  // hits/crits genuinely slam without freezing enemy combat. `angle` is the
  // direction of the blow; the kick points the same way the enemy is knocked.
  function applyHitFeel(enemy, dealt, angle, isCrit) {
    // Enemies store max HP in `.max` (players use `.maxHp`).
    const maxHp = enemy ? (enemy.max || enemy.maxHp || dealt * 6) : dealt * 6;
    const ratio = Neo.clamp(dealt / Math.max(1, maxHp), 0, 1);
    // Below a small threshold (pure chip), skip feel entirely — keeps DoT ticks
    // and weak pellets from constantly nudging the camera.
    if (ratio < 0.04 && !isCrit) return;
    const heavy = Neo.clamp(ratio * 2.4, 0, 1);          // 0..1 "heaviness"
    const trauma = (isCrit ? 0.32 : 0.16) + heavy * 0.3;   // big hits → big shake
    const kick = (isCrit ? 5 : 2.5) + heavy * 6;           // px of directional kick
    Neo.addTrauma?.(trauma, angle, kick);
  }

  function getEnemyBleedResistance(enemy) {
    // Use cumulative floors entered (across loops) so bleed resistance keeps pace
    // with enemy HP/damage scaling instead of resetting every loop. See
    // getProgressionDepth() / scaleEnemyStats() in enemies.js.
    const progressionDepth = Neo.getProgressionDepth ? Neo.getProgressionDepth() : Math.max(1, Number(Neo.floor) || 1);
    const loopNumber = Math.max(1, Math.floor((progressionDepth - 1) / Neo.MAX_FLOOR) + 1);
    const floorInLoop = ((progressionDepth - 1) % Neo.MAX_FLOOR) + 1;
    let resistance = 1;
    resistance += Math.max(0, floorInLoop - 1) * Neo.BLEED_RESIST_SCALING.floorInLoop;
    resistance += Math.max(0, loopNumber - 1) * Neo.BLEED_RESIST_SCALING.loop;
    if (enemy?.elite) resistance += Neo.BLEED_RESIST_SCALING.elite;
    if (enemy?.miniBoss) resistance += Neo.BLEED_RESIST_SCALING.miniBoss;
    if (Neo.isBossType(enemy?.type) || enemy?.type === 'god') resistance += Neo.BLEED_RESIST_SCALING.boss;
    if (enemy?.type === 'rival' || enemy?.type === 'mirror_knight') resistance += Neo.BLEED_RESIST_SCALING.rival;
    return Math.max(1, resistance);
  }

  function scaleBleedDamageAgainstEnemy(enemy, stacks, cachedStats = null) {
    const baseBleed = 1.8 + Math.max(1, Number(stacks || 1)) * 2.2;
    const preResist = scaleDamageAgainstEnemy(enemy, baseBleed, NO_BLEED_BONUS_DAMAGE_OPTIONS, cachedStats);
    const itemResistance = Neo.clamp(Number(enemy?.bleedResistance || 0), 0, 0.8);
    const reduced = (preResist / getEnemyBleedResistance(enemy)) * Math.max(0.2, 1 - itemResistance);
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
    else if (weaponKey === 'metao_fire_staff') base = 1.75;
    else if (weaponKey === 'magenta_degale') base = 1.5;
    else if (weaponKey === 'magenta_p90') base = 1.8;
    else if (weaponKey === 'gelleh_lightning_spear') base = 0.75;
    else if (weaponKey === 'excalibur') base = 1.554;
    else if (weaponKey === 'katana_excalibur_777x') base = 0.777;
    else if (weaponKey === 'golden_fleece') base = 0.5;
    else if (weaponKey === 'void_piercer') base = 0.8;
    else if (weaponKey === 'princess_wand') base = 0.77;
    else base = 0.5;
    const bonus = Neo.getAnvilWeaponBonus(weaponKey, 'cooldown');
    return Math.max(base * 0.5, base + bonus);
  }

  const CHARGED_WEAPON_MAX_CHARGES = {
    princess_wand: 3,
    metao_fire_staff: 2,
    magenta_degale: 3,
    magenta_p90: 5,
    katana_excalibur_777x: 2,
  };

  // Max charges = static base, raised by Extra Battery picks on the weapon
  // (stored as an absolute count in player.weaponChargeOverrides, mirroring
  // moveStackOverrides). A battery can turn a 1-charge weapon into a charged one.
  function getWeaponMaxCharges(weaponKey, playerState = Neo.player) {
    const base = Math.max(1, Number(CHARGED_WEAPON_MAX_CHARGES[weaponKey] || 1));
    const override = Math.max(0, Math.floor(Number(playerState?.weaponChargeOverrides?.[weaponKey] || 0)));
    return Math.max(base, override);
  }

  function isChargedWeaponKey(weaponKey, playerState = Neo.player) {
    return getWeaponMaxCharges(weaponKey, playerState) > 1;
  }

  function ensureWeaponChargeState(weaponKey, playerState = Neo.player) {
    if (!playerState || !isChargedWeaponKey(weaponKey, playerState)) return null;
    const maxCharges = getWeaponMaxCharges(weaponKey, playerState);
    const timers = Array.isArray(playerState.weaponChargeTimers)
      ? playerState.weaponChargeTimers.map(value => Number(value)).filter(value => value > 0)
      : [];
    if (playerState.weaponChargeKey !== weaponKey || Number(playerState.weaponMaxCharges || 0) !== maxCharges) {
      playerState.weaponChargeKey = weaponKey;
      playerState.weaponCharges = maxCharges;
      playerState.weaponMaxCharges = maxCharges;
      playerState.weaponChargeTimers = [];
      return { charges: maxCharges, maxCharges, timers: [] };
    }
    const charges = Math.max(0, Math.min(maxCharges, Math.floor(Number(playerState.weaponCharges ?? maxCharges))));
    const normalizedTimers = timers.slice(0, Math.max(0, maxCharges - charges));
    playerState.weaponCharges = charges;
    playerState.weaponMaxCharges = maxCharges;
    playerState.weaponChargeTimers = normalizedTimers;
    return { charges, maxCharges, timers: normalizedTimers };
  }

  function spendWeaponCharge(weaponKey, rechargeTime) {
    const state = ensureWeaponChargeState(weaponKey);
    if (!state || state.charges <= 0) return false;
    Neo.player.weaponCharges = state.charges - 1;
    Neo.player.weaponChargeTimers = [...state.timers, rechargeTime];
    Neo.updateHud();
    return true;
  }

  function tickWeaponCharges(dt) {
    if (!Neo.player?.weaponChargeKey || !isChargedWeaponKey(Neo.player.weaponChargeKey)) return;
    const state = ensureWeaponChargeState(Neo.player.weaponChargeKey);
    if (!state || !state.timers.length) return;
    const nextTimers = [];
    let restoredCharges = 0;
    state.timers.forEach(timer => {
      const nextTimer = timer - dt;
      if (nextTimer <= 0) restoredCharges += 1;
      else nextTimers.push(nextTimer);
    });
    Neo.player.weaponChargeTimers = nextTimers;
    Neo.player.weaponCharges = Math.min(state.maxCharges, state.charges + restoredCharges);
  }

  function getWeaponCooldownInfo(weaponKey, attackSpeed = Neo.getAttackSpeedValue()) {
    if (!isChargedWeaponKey(weaponKey)) {
      const max = getWeaponBaseCooldown(weaponKey);
      const current = Number(Neo.player?.weaponCooldown || 0);
      return {
        current,
        max,
        charges: current > 0 ? 0 : 1,
        maxCharges: 1,
        timers: current > 0 ? [current] : [],
      };
    }
    const state = ensureWeaponChargeState(weaponKey);
    const max = getWeaponBaseCooldown(weaponKey) / attackSpeed;
    return {
      current: state?.timers?.length ? Math.min(...state.timers) : 0,
      max,
      charges: state?.charges ?? getWeaponMaxCharges(weaponKey),
      maxCharges: state?.maxCharges ?? getWeaponMaxCharges(weaponKey),
      timers: state?.timers?.slice?.() || [],
    };
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
    Neo.playSfx?.('fire');
  }

  function getMovingGunPenalty(weaponKey) {
    const tuning = MOVING_GUN_PENALTIES[weaponKey];
    if (!tuning || !Neo.player) return { spread: 0, recoilMultiplier: 1 };
    const speed = Math.hypot(Number(Neo.player.vx || 0), Number(Neo.player.vy || 0));
    const movementRatio = Neo.clamp((speed - 24) / (228 - 24), 0, 1);
    return {
      spread: tuning.maxSpread * movementRatio,
      recoilMultiplier: 1 + tuning.recoilBonus * movementRatio,
    };
  }

  function fireConfiguredWeaponProjectile(weaponKey, angle, damage, knockback, overrides = {}) {
    const movementPenalty = getMovingGunPenalty(weaponKey);
    const shotAngle = angle + Neo.rand(movementPenalty.spread, -movementPenalty.spread, 'encounter');
    const config = Neo.buildWeaponProjectileConfig?.(weaponKey, { angle: shotAngle, damage, knockback, ...overrides });
    if (!config) return false;
    spawnWeaponProjectile(config);
    if (config.recoil > 0) {
      const recoil = config.recoil * movementPenalty.recoilMultiplier;
      Neo.player.vx -= Math.cos(config.angle) * recoil;
      Neo.player.vy -= Math.sin(config.angle) * recoil;
    }
    if (config.muzzleRing > 0) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.18, ring: config.muzzleRing, c: config.color });
    }
    return true;
  }

  // Delay before the claw gauntlets' second swipe lands, in seconds. Short
  // enough to read as a single quick one-two flurry rather than two attacks.
  const CLAW_GAUNTLETS_SECOND_DELAY = 0.12;

  function fireWeaponSweep(damage, range, arc, push, color, options = {}) {
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x) + Number(options.angleOffset || 0);
    const itemStats = Neo.getItemStats?.() || {};
    const adjustedRange = range + (Neo.player?.character === 'thorn_knight' ? Math.min(34, Number(itemStats.tagCounts?.bleed || 0) * 3) : 0);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    Neo.player.stabSwing = false;
    Neo.playSfx?.('sword_swing');
    forEachEnemyNearPlayer(adjustedRange, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, adjustedRange)) return;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > arc) return;
      hitEnemy(enemy, damage, angle, push, color, options);
      if (options.bleedChance > 0 && Neo.nextRandom('encounter') < options.bleedChance) {
        applyBleed(enemy, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4));
      }
      if (options.itemBleedChance > 0 && Neo.nextRandom('encounter') < options.itemBleedChance) {
        applyBleed(enemy, 1, 5);
      }
    });

    forEachDestructibleNearPlayer(adjustedRange + 32, prop => {
      if (prop.broken || prop.hidden) return;
      const potAssist = prop.kind === 'pot';
      const reachBonus = potAssist ? 24 : 10;
      const arcBonus = potAssist ? 0.4 : 0.2;
      const touchingBonus = potAssist ? 30 : 18;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, adjustedRange, reachBonus)) return;
      if (potAssist && isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, adjustedRange, 26)) {
        Neo.damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      const touching = isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, Neo.player.r, touchingBonus);
      if (!touching && difference > arc + arcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const attackSpeed = Neo.getAttackSpeedValue();
    if (isChargedWeaponKey(weaponKey)) {
      if (!spendWeaponCharge(weaponKey, getWeaponBaseCooldown(weaponKey) / attackSpeed)) return false;
    } else if (Neo.player.weaponCooldown > 0) {
      return false;
    }
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
    if (weaponKey === 'thorns_bleed_blade') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Neo.ATTACKS.melee.arc, wKnk(weaponKey), '#ff6e8b', { bleedChance: 0.10, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 });
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'claw_gauntlets') {
      // Claws strike twice: an immediate swipe leaning one way, then a mirrored
      // follow-up 0.12s later for a quick one-two "X" flurry across the cursor.
      const clawOpts = { bleedChance: 0.22, bleedStacks: 1, bleedDuration: 5, itemBleedChance: itemStats.bleedChance || 0 };
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Math.PI * 0.7, wKnk(weaponKey), '#ff7a9a', { ...clawOpts, angleOffset: -0.18 });
      Neo.clawSwipeQueue.push({ delay: CLAW_GAUNTLETS_SECOND_DELAY, damage: wDmg(weaponKey), range: wRng(weaponKey), push: wKnk(weaponKey), options: { ...clawOpts, angleOffset: 0.18 } });
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
      if (!isChargedWeaponKey(weaponKey)) Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'magenta_p90') {
      const attack = Neo.getWeaponProjectileAttack?.(weaponKey) || {};
      const burstCount = Math.max(1, Math.floor(Number(attack.burstCount || 5)));
      const burstDelay = Number(attack.burstDelay ?? 0.04);
      const spread = Number(attack.spread ?? 0.05);
      for (let shot = 0; shot < burstCount; shot += 1) {
        Neo.weaponBurstQueue.push({
          delay: shot * burstDelay,
          angle: angle + Neo.rand(spread, -spread, 'encounter'),
          weaponKey,
        });
      }
      if (!isChargedWeaponKey(weaponKey)) Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'gelleh_lightning_spear') {
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
    if (weaponKey === 'katana_excalibur_777x') {
      // Forward 777% slash, then twin triangle-cone waves erupt right and left
      // a few frames later so each charge reads as one blinding three-cut combo.
      const katanaDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 7.77 + Neo.getAnvilWeaponBonus(weaponKey, 'damage')));
      const katanaRange = wRng(weaponKey);
      const katanaKnockback = wKnk(weaponKey);
      fireWeaponSweep(katanaDamage, katanaRange, 0.6, katanaKnockback, '#ffd06b', { rawDamage: true });
      [Math.PI / 2, -Math.PI / 2].forEach((sideOffset, sideIndex) => {
        Neo.clawSwipeQueue.push({
          delay: 0.05 + sideIndex * 0.05,
          damage: katanaDamage,
          range: katanaRange,
          push: katanaKnockback,
          arc: 0.6,
          color: '#ff8a5c',
          options: { rawDamage: true, angleOffset: sideOffset },
        });
      });
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.45, ring: 48, c: '#ffb35c' });
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Neo.ATTACKS.melee.arc, wKnk(weaponKey), '#ffe8a0');
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (Neo.isProjectileWeaponKey?.(weaponKey)) {
      fireConfiguredWeaponProjectile(weaponKey, angle, wDmg(weaponKey), wKnk(weaponKey));
      if (!isChargedWeaponKey(weaponKey)) Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    return false;
  }

  function tryMelee(options = {}) {
    cancelCowardsWayOnAttack();
    const itemStats = Neo.getItemStats();
    const useRobotArmCharge = !!options.useRobotArmCharge && itemStats.hasRobotArm && Neo.player?.robotArmReady;
    if (getEquippedWeapon()) {
      const attacked = tryWeaponAttack();
      if (attacked && useRobotArmCharge) Neo.consumeCharge('robot_arm');
      return;
    }
    const move = getEquippedMove('melee');
    const attackSpeed = Neo.getAttackSpeedValue();
    if (!Neo.spendSkillCharge('melee', Neo.getMeleeCooldownDuration(move, attackSpeed))) return;
    if (useRobotArmCharge) Neo.consumeCharge('robot_arm');
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
    Neo.player.stabSwing = false;
    Neo.playSfx?.('sword_swing');

    const anvilDmgBonus = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRngBonus = Neo.getAnvilMoveBonus(move, 'range');
    const damage = (Neo.godTimer > 0 ? 56 : Neo.ATTACKS.melee.damage) + anvilDmgBonus;
    const thornBleedReach = Neo.player?.character === 'thorn_knight' ? Math.min(34, Number(itemStats.tagCounts?.bleed || 0) * 3) : 0;
    const meleeRange = Neo.ATTACKS.melee.range + anvilRngBonus + thornBleedReach;
    const meleeKnockback = move === 'slash' ? Neo.SLASH_KNOCKBACK : Neo.ATTACKS.melee.push;
    const slashBleedChance = move === 'slash' ? 0.10 : 0;
    forEachEnemyNearPlayer(meleeRange, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, meleeRange)) return;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > Neo.ATTACKS.melee.arc) return;
      hitEnemy(enemy, damage, angle, meleeKnockback, '#0ff');
      if (slashBleedChance > 0 && Neo.rng() < slashBleedChance) applyBleed(enemy, 1, 5);
      if (itemStats.bleedChance > 0 && Neo.rng() < itemStats.bleedChance) applyBleed(enemy, 1, 5);
    });
    forEachDestructibleNearPlayer(meleeRange + 32, prop => {
      if (prop.broken || prop.hidden) return;
      const slashPotAssist = move === 'slash' && prop.kind === 'pot';
      const destructibleReachBonus = slashPotAssist ? 24 : 8;
      const destructibleArcBonus = slashPotAssist ? 0.45 : 0.25;
      const touchingBonus = slashPotAssist ? 32 : 18;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, meleeRange, destructibleReachBonus)) return;
      if (slashPotAssist && isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, meleeRange, 24)) {
        Neo.damageDestructible(prop, 1);
        return;
      }
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      const touching = isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, Neo.player.r, touchingBonus);
      if (!touching && difference > Neo.ATTACKS.melee.arc + destructibleArcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function fireLazerGlassesTick() {
    const itemStats = Neo.getItemStats?.() || {};
    const beamDamage = 9 * Number(itemStats.beamDamageMultiplier || 1);
    const baseAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    for (let beamIndex = 0; beamIndex < 2; beamIndex += 1) {
      const offset = beamIndex === 0 ? -0.2 : 0.2;
      const angle = baseAngle + offset;
      const beamPath = Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, angle, 430, Neo.LAZER_GLASSES_BOUNCES);
      let target = null;
      let hitSegment = null;
      for (let index = 0; index < Neo.enemies.length; index += 1) {
        const enemy = Neo.enemies[index];
        if (!enemy) continue;
        const beamPadding = 4 * Number(itemStats.beamWidthMultiplier || 1);
        hitSegment = Neo.beamPathHitsCircle(beamPath, enemy.x, enemy.y, enemy.r + beamPadding);
        if (hitSegment) {
          target = enemy;
          break;
        }
      }
      if (target) {
        hitEnemy(target, beamDamage, hitSegment?.angle ?? angle, 80, '#cda8ff', { fireChance: 0.05, fireStacks: 1, fireDuration: 3, beamFx: true });
        chainBeamHit(target, beamDamage, hitSegment?.angle ?? angle, '#d890ff');
      }
      forEachDestructibleNearBeamPath(beamPath, 4, prop => {
        if (!prop.broken && !prop.hidden && Neo.beamPathHitsDestructible(beamPath, prop, 4)) {
          Neo.damageDestructible(prop, 1);
        }
      });
    }
  }

  function updateWeaponSystems(dt) {
    Neo.player.weaponCooldown = Math.max(0, Number(Neo.player.weaponCooldown || 0) - dt);
    tickWeaponCharges(dt);
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
        const gained = Neo.applyPlayerHealing(heal);
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained, { color: '#ffe59c' });
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
        fireConfiguredWeaponProjectile('magenta_p90', queued.angle, p90Dmg, p90Knk);
      }
      Neo.weaponBurstQueue.splice(index, 1);
    }

    for (let index = Neo.clawSwipeQueue.length - 1; index >= 0; index -= 1) {
      const queued = Neo.clawSwipeQueue[index];
      queued.delay -= dt;
      if (queued.delay > 0) continue;
      fireWeaponSweep(queued.damage, queued.range, queued.arc ?? Math.PI * 0.7, queued.push, queued.color || '#ff7a9a', queued.options);
      Neo.clawSwipeQueue.splice(index, 1);
    }
  }

  // Instant ("one-shot") laser moves fire-and-finish instead of opening a held
  // beam. They must NOT auto-repeat every frame while the button is held — with
  // a multi-charge pool that would drain every charge in a few frames. Beam
  // moves are absent here because Neo.laserActive already blocks their re-entry.
  const INSTANT_LASER_MOVES = new Set(['power_disks', 'blade_justice', 'lightning_columns', 'nail_shot']);
  function isInstantLaserMove(move) {
    return INSTANT_LASER_MOVES.has(move || getEquippedMove('laser'));
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
    if (move === 'thorn_blood_beams') {
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'thorn_blood_beams';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
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
    Neo.activeBeamPaths = null;
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
    // Wizard Lazer is a heavy beam: big extra recoil kick on top of the normal
    // weight-based push so the thick purple beam shoves the caster back hard.
    const wizardLazerActive = move === 'wizard_lazer';
    const recoilAccel = (45 * weight) + (wizardLazerActive ? 220 : 0);
    if (recoilAccel > 0) {
      Neo.player.vx -= Math.cos(angle) * recoilAccel * dt;
      Neo.player.vy -= Math.sin(angle) * recoilAccel * dt;
    }
    if (Neo.laserTick <= 0) {
      if (Neo.laserMode === 'god_sweep') Neo.laserAngle += Neo.laserSweepSpeed * 0.05;
      Neo.laserTick = Neo.laserMode === 'god_sweep' ? 0.05 : Neo.laserMode === 'turtle_wave' ? 0.08 : loveBeamActive ? 0.06 : Neo.ATTACKS.laser.tick;
      const mooggyBeamActive = move === 'mooggy_blood_beam';
      const wizardBeamActive = wizardLazerActive;
      const thornBeamsActive = Neo.laserMode === 'thorn_blood_beams';
      const range = Neo.getPlayerBeamRange(Neo.laserMode, move);
      // Wizard Lazer is visually and mechanically thick; Mooggy's blood beam is a
      // touch wider than a standard beam too.
      const widthBonus = wizardBeamActive ? 16 : mooggyBeamActive ? 6 : 0;
      const radiusPadding = ((Neo.laserMode === 'turtle_wave' ? 14 : 6) + widthBonus)
        * Number(itemStats.beamWidthMultiplier || 1);
      const baseBeamDamage = Neo.laserMode === 'god_sweep'
        ? 12
        : Neo.laserMode === 'turtle_wave'
          ? 34
          : loveBeamActive
            ? 18
            : wizardBeamActive
              ? 30
              : mooggyBeamActive
                ? 12
                : thornBeamsActive
                  ? 8
                  : Neo.godTimer > 0
                    ? 16
                    : Neo.ATTACKS.laser.damage;
      const anvilBeamBonus = Neo.getAnvilMoveBonus(move, 'damage');
      const beamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1);
      const anvilCritBonus = Neo.getAnvilMoveBonus(move, 'critChance');
      const beamKnockback = Neo.laserMode === 'god_sweep' ? 120
        : Neo.laserMode === 'turtle_wave' ? 155
        : loveBeamActive ? 52
        : wizardBeamActive ? 150
        : 60;
      const beamColor = loveBeamActive ? '#ff9ed6'
        : wizardBeamActive ? '#a64bff'
        : mooggyBeamActive ? '#ff2f57'
        : thornBeamsActive ? '#ff3b5c'
        : '#f0f';
      const beamChainColor = loveBeamActive ? '#ffb8e0'
        : wizardBeamActive ? '#c79bff'
        : (mooggyBeamActive || thornBeamsActive) ? '#ff8aa0'
        : '#d890ff';
      const hitOptions = anvilCritBonus > 0 ? { critBonus: anvilCritBonus, beamFx: true } : { beamFx: true };
      const bloodBeamActive = move === 'blood_beam';
      let loveBeamHits = 0;
      // Build the set of beam paths to apply this tick. Thorn's Infinite Blood
      // Beam fires four bleeding beams fanned around the aim direction; everything
      // else is a single beam down the aim line.
      const beamAngles = thornBeamsActive
        ? [angle - 0.32, angle - 0.11, angle + 0.11, angle + 0.32]
        : [angle];
      const beamPaths = beamAngles.map(a =>
        Neo.buildRicochetBeamPath(Neo.player.x, Neo.player.y, a, range, Neo.getPlayerBeamBounceCount(Neo.laserMode)));
      Neo.activeBeamPaths = beamPaths; // exposed for the renderer (multi-beam draw)
      const beamPath = beamPaths[0];
      const hitThisTick = new Set();
      for (let pathIndex = 0; pathIndex < beamPaths.length; pathIndex += 1) {
        const path = beamPaths[pathIndex];
        forEachEnemyNearBeamPath(path, radiusPadding, enemy => {
          const hitSegment = Neo.beamPathHitsCircle(path, enemy.x, enemy.y, enemy.r + radiusPadding);
          if (!hitSegment) return;
          // Tooth of Thorn drains per beam that lands: with four converging beams
          // this fan should lifesteal harder when aimed onto a single target. The
          // damage/status dedup below still keeps each enemy to one hit per tick,
          // so we roll drain here (before the dedup) — but only for the multi-beam
          // fan, since single-beam moves already roll it inside hitEnemy.
          if (thornBeamsActive) rollToothOfThornDrain(enemy);
          // A single enemy straddling two of Thorn's beams shouldn't take the full
          // hit from each beam in the same tick.
          if (hitThisTick.has(enemy)) return;
          hitThisTick.add(enemy);
          hitEnemy(enemy, beamDamage, hitSegment.angle, beamKnockback, beamColor,
            thornBeamsActive ? { ...hitOptions, skipDrainRoll: true } : hitOptions);
          chainBeamHit(enemy, beamDamage, hitSegment.angle, beamChainColor);
          if (loveBeamActive) loveBeamHits += 1;
          if (bloodBeamActive && Neo.rng() < 0.05) applyBleed(enemy, 1, 3.2);
          if (bloodBeamActive && Neo.rng() < 0.08) applyDarkDrain(enemy, 1, 3.4);
          // Thorn's beams bleed hard — that's their whole identity.
          if (thornBeamsActive && Neo.rng() < 0.35) applyBleed(enemy, 1, 3.6);
          // Mooggy's assassin beam drenches in poison and freezes solid.
          if (mooggyBeamActive) {
            if (Neo.rng() < 0.5) applyPoison(enemy, 2, 5);
            if (Neo.rng() < 0.18) freezeEnemy(enemy);
          }
        });
        Neo.hitPvpPlayer2WithBeamPath?.(path, radiusPadding, beamDamage, beamKnockback, 'pvp_p1_beam');
        forEachDestructibleNearBeamPath(path, 4, prop => {
          if (!prop.broken && !prop.hidden && Neo.beamPathHitsDestructible(path, prop, 4)) {
            Neo.damageDestructible(prop, 1);
          }
        });
      }
      if (loveBeamHits > 0) {
        const heal = Neo.scalePlayerHealing(Math.min(8, loveBeamHits * 1.25));
        const gained = Neo.applyPlayerHealing(heal);
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ff9ed6' });
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
      // At full HP a potion can be shared instead: healing a wounded rival
      // standing nearby befriends them for the rest of the run.
      const rivalEnemy = Neo.enemies.find(e => e.type === 'rival'
        && e.rivalData
        && !e.rivalData.friend
        && e.hp < e.max
        && Neo.dist(e.x, e.y, Neo.player.x, Neo.player.y) < 140);
      if (rivalEnemy) {
        Neo.player.storedPotions = stored - 1;
        Neo.spawnHealPopup?.(rivalEnemy.x, rivalEnemy.y - 22, Math.max(1, rivalEnemy.max - rivalEnemy.hp), { color: '#8dffbd' });
        Neo.befriendRival?.(rivalEnemy.rivalData, rivalEnemy);
        Neo.updateHud();
        return;
      }
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'FULL HP', c: '#a0ffa0' });
      return;
    }
    Neo.player.storedPotions = stored - 1;
    const itemStats = Neo.getItemStats?.() || {};
    const doubled = Neo.clamp(Number(itemStats.potionDoubleChance || 0), 0, 1) > 0 && Neo.rng() < Neo.clamp(Number(itemStats.potionDoubleChance || 0), 0, 1);
    const heal = Neo.getPotionHealAmount() * (doubled ? 2 : 1);
    const gained = Neo.applyPlayerHealing(heal);
    if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
    if (doubled) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
    Neo.updateHud();
  }

  const HEALING_ZONE_MAX_CHARGE = 5; // seconds of hold for a full-power zone

  function trySmash() {
    cancelCowardsWayOnAttack();
    const itemStats = Neo.getItemStats();
    const attackSpeed = Neo.getAttackSpeedValue();
    // Healing Zone is hold-to-charge: holding the smash key winds it up (up to
    // 5s) for a bigger, stronger zone, released in updateHealingZoneCharge().
    if (getEquippedMove('smash') === 'healing_zone') {
      if (Neo.healingZoneCharging) return; // already winding up
      if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed), { deferTimer: true })) return;
      Neo.healingZoneCharging = true;
      Neo.healingZoneChargeTime = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: '#47ff7d' });
      return;
    }
    if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed))) return;
    if (itemStats.homingMissileChance > 0 && Neo.nextRandom('encounter') < itemStats.homingMissileChance) {
      const base = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      for (let index = 0; index < 2; index += 1) {
        const angle = base + (index === 0 ? -0.12 : 0.12);
        Neo.spawnProjectile({
          x: Neo.player.x,
          y: Neo.player.y,
          // 3x faster than the old missiles (780 vs 260 launch, 1260 vs 420 homing).
          vx: Math.cos(angle) * 780,
          vy: Math.sin(angle) * 780,
          r: 6,
          life: 2.4,
          enemy: false,
          kind: 'homing_missile',
          damage: 20, // +10% over the old 18.
          knockback: 140,
          color: '#ffe06f',
          homing: true,
          homingTarget: 'enemy',
          homingRadius: 960,
          homingSpeed: 1260,
          homingAccel: 3.8,
          homingTurnRate: 3.4,
          // 5% chance to ignite on hit.
          hitOptions: { fireChance: 0.05, fireStacks: 1, fireDuration: 2.8 },
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
    if (move === 'fire_circle') {
      castFireCircle();
      return;
    }
    if (move === 'floor_lava') {
      castFloorLava();
      return;
    }
    if (move === 'random_pounce') {
      castRandomPounce();
      return;
    }
    if (move === 'mooggy_hairball') {
      castMooggyHairball();
      return;
    }
    if (move === 'potion_bath') {
      castPotionBath();
      return;
    }
    if (move === 'excalibur_strike') {

      

      castExcaliburStrike();
      return;
    }
    if (move === 'holy_turrets') {
      castHolyTurrets();
      return;
    }
    const anvilSmashRange = Neo.getAnvilMoveBonus(move, 'range');
    const smashColor = move === 'crimson_smash'
      ? '#ff3048'
      : move === 'chaos_burst'
        ? '#a857ff'
        : '#ff66cc';
    const smashRadius = (Neo.ATTACKS.smash.radius + anvilSmashRange) * (itemStats.aoeRadiusMultiplier || 1);
    // Heavy ground slam: trauma-based shake (matches melee feel) plus a big
    // downward camera lurch and a brief hitstop so the impact reads.
    Neo.addTrauma?.(0.8, Math.PI / 2, 26);
    Neo.addHitstop?.(0.06);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.4, ring: smashRadius - 30, c: smashColor });
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, smashRadius, smashColor, 'heavy');
    Neo.hitPvpPlayer2InRadius?.(Neo.player.x, Neo.player.y, smashRadius, Neo.ATTACKS.smash.damage + Neo.getAnvilMoveBonus(move, 'damage'), 320, 'pvp_p1_smash');
    const baseSmashDamage = (Neo.godTimer > 0 ? 82 : Neo.ATTACKS.smash.damage) + Neo.getAnvilMoveBonus(move, 'damage');
    forEachEnemyNearPlayer(smashRadius, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, smashRadius)) return;
      const angle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      let damage = baseSmashDamage;
      if (itemStats.bleedDamageMultiplier > 1 && Neo.getStatusStacks(enemy, 'bleed') > 0) {
        damage += Neo.ATTACKS.smash.bonus;
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, smashColor);
    });
    forEachDestructibleNearPlayer(smashRadius, prop => {
      if (!prop.broken && !prop.hidden && isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, smashRadius)) {
        Neo.damageDestructible(prop, 2);
      }
    });
    // Crimson Smash also hurls a ring of rock shards outward — the slam kicks up
    // debris that keeps dealing damage past the AOE edge.
    if (move === 'crimson_smash') {
      const aimBase = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const rockCount = 8;
      const rockDamage = Math.round(baseSmashDamage * 0.45);
      for (let index = 0; index < rockCount; index += 1) {
        const angle = aimBase + (index / rockCount) * Math.PI * 2;
        const speed = 460 + Neo.nextRandom('fx') * 120;
        Neo.spawnProjectile({
          x: Neo.player.x + Math.cos(angle) * (smashRadius * 0.4),
          y: Neo.player.y + Math.sin(angle) * (smashRadius * 0.4),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 7,
          life: 0.62,
          enemy: false,
          kind: 'rock',
          damage: rockDamage,
          knockback: 200,
          // Impact fx match the floor the debris was kicked up from.
          color: Neo.getRoomArtTheme?.()?.backdrop || '#8a5a3c',
          pierceCount: 1,
          hitOptions: { bleedChance: 0.2, bleedStacks: 1, bleedDuration: 4 },
        });
      }
    }
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
    if (move === 'knight_slash_dash') {
      castKnightSlashDash(moveX, moveY);
      return;
    }
    castDashBurst(moveX, moveY);
  }

  // Bleeding slash left in the wake of a Knight's Slash Dash hop: slashes every
  // enemy near the line travelled and applies heavy bleed, with a red streak.
  function strikeSlashLine(x1, y1, x2, y2, lineDamage, lineRadius) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 4) return;
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const reach = lineRadius + length * 0.5;
    Neo.forEachEnemyNearCircle?.(midX, midY, reach + 80, enemy => {
      if (!enemy || enemy.dead) return;
      if (Neo.distToSegment(enemy.x, enemy.y, x1, y1, x2, y2) > lineRadius + enemy.r) return;
      const angle = Math.atan2(enemy.y - y1, enemy.x - x1);
      hitEnemy(enemy, lineDamage, angle, 170, '#ff3b5c');
      applyBleed(enemy, 3, 5);
    });
    if (typeof Neo.forEachDestructibleNearCircle === 'function') {
      Neo.forEachDestructibleNearCircle(midX, midY, reach + COMBAT_SPATIAL_PADDING, prop => {
        if (prop.broken || prop.hidden) return;
        if (Neo.distToSegment(prop.x, prop.y, x1, y1, x2, y2) > lineRadius + (prop.r || 12)) return;
        Neo.damageDestructible(prop, 2);
      });
    }
    Neo.spawnParticle({
      x: x1, y: y1, life: 0.28, c: '#ff3b5c',
      line: { x1, y1, x2, y2, w: 5, jag: 10, seg: Math.max(6, Math.round(length / 26)), phase: Neo.rng() * Math.PI * 2 },
    });
  }

  // Thorn's Knight's Slash Dash: a mobility move that hops between nearby
  // enemies (like Zip Lightning), striking everything in each hop's wake with a
  // heavy bleed rate.
  function castKnightSlashDash(moveX, moveY) {
    const itemStats = Neo.getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = Math.round((Neo.godTimer > 0 ? 56 : 42) * (itemStats.damageMultiplier || 1));
    const lineRadius = 46 * (itemStats.aoeRadiusMultiplier || 1);
    const lineDamage = Math.max(1, Math.round(baseDamage * 0.7));
    let sourceX = Neo.player.x;
    let sourceY = Neo.player.y;
    let performedHop = false;
    for (let hop = 0; hop < hops; hop += 1) {
      const searchX = hop === 0 ? Neo.mouse.worldX : sourceX;
      const searchY = hop === 0 ? Neo.mouse.worldY : sourceY;
      const target = Neo.findNearestEnemy(searchX, searchY, hop === 0 ? 300 : 260, visited)
        || Neo.findNearestEnemy(sourceX, sourceY, 260, visited);
      if (!target) break;
      visited.add(target);
      const toward = Math.atan2(target.y - sourceY, target.x - sourceX);
      // Land just PAST the target so the dash strikes "whatever was behind".
      const landDist = target.r + Neo.player.r + 6;
      const landing = findSafePointNearTarget(
        target.x + Math.cos(toward) * landDist,
        target.y + Math.sin(toward) * landDist,
        Neo.player.r,
        90,
        14
      ) || findSafePointNearTarget(
        target.x - Math.cos(toward) * landDist,
        target.y - Math.sin(toward) * landDist,
        Neo.player.r,
        90,
        14
      );
      const fromX = sourceX;
      const fromY = sourceY;
      if (landing) teleportPlayerTo(landing.x, landing.y, '#ff3b5c');
      sourceX = Neo.player.x;
      sourceY = Neo.player.y;
      performedHop = true;
      // Bleeding slash streaks along the corridor the dash just travelled.
      strikeSlashLine(fromX, fromY, Neo.player.x, Neo.player.y, lineDamage, lineRadius);
      // Direct heavy strike on the hop target.
      const hitAngle = Math.atan2(target.y - Neo.player.y, target.x - Neo.player.x);
      hitEnemy(target, baseDamage, hitAngle, 185, '#ff3b5c');
      applyBleed(target, 4, 5);
      Neo.player.swing = Neo.ATTACKS.melee.active;
      Neo.player.swingA = hitAngle;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.22, ring: 16 + hop * 4, c: '#ff8aa0' });
    }

    if (!performedHop) {
      // No enemy to chain to — dash toward the aim/move direction and still
      // leave a bleeding slash trail along the path.
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
      const fromX = Neo.player.x;
      const fromY = Neo.player.y;
      const fallback = findSafePointNearTarget(Neo.player.x + Math.cos(angle) * 210, Neo.player.y + Math.sin(angle) * 210, Neo.player.r, 120, 16);
      if (fallback) {
        teleportPlayerTo(fallback.x, fallback.y, '#ff3b5c');
        Neo.player.swing = Neo.ATTACKS.melee.active;
        Neo.player.swingA = angle;
        strikeSlashLine(fromX, fromY, Neo.player.x, Neo.player.y, lineDamage, lineRadius);
      }
    }

    Neo.shake = Math.max(Neo.shake, 7);
    Neo.shakeT = Math.max(Neo.shakeT, 0.13);
    Neo.player.inv = Math.max(Neo.player.inv, 0.26);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.24, ring: 70 * (itemStats.aoeRadiusMultiplier || 1), c: '#ff8aa0' });
  }

  // chargeFactor (0..1) scales up the swipe when released from a hold: a full
  // charge boosts damage, reach, arc and knockback for a meaty empowered slash.
  function castMooggySwipe(chargeFactor = 0) {
    const charge = Neo.clamp(Number(chargeFactor) || 0, 0, 1);
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('melee');
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    Neo.player.stabSwing = false;
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRng = Neo.getAnvilMoveBonus(move, 'range');
    // Full charge: +150% damage, +40% reach, wider arc, +80% knockback.
    const damage = Math.round(((Neo.godTimer > 0 ? 72 : 44) + anvilDmg) * (1 + charge * 1.5));
    const range = (130 + anvilRng) * (1 + charge * 0.4);
    const arc = Math.PI * (0.72 + charge * 0.28);
    const knockback = Neo.ATTACKS.melee.push * (1 + charge * 0.8);
    const bleedChance = 0.12 + charge * 0.4 + itemStats.bleedChance;
    forEachEnemyNearPlayer(range, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, range)) return;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const diff = angleDifferenceAbs(targetAngle, angle);
      if (diff > arc) return;
      hitEnemy(enemy, damage, angle, knockback, '#ff6090');
      if (Neo.rng() < bleedChance) applyBleed(enemy, charge >= 0.99 ? 2 : 1, 5);
    });
    forEachDestructibleNearPlayer(range + 8, prop => {
      if (prop.broken || prop.hidden) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, range, 8)) return;
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const diff = angleDifferenceAbs(targetAngle, angle);
      if (diff > arc + 0.25) return;
      Neo.damageDestructible(prop, 1);
    });
    const ring = 28 * (1 + charge * 0.9);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.22 + charge * 0.18, ring, c: charge >= 0.99 ? '#ffd0e6' : '#ff6090' });
    if (charge > 0.25) {
      Neo.addTrauma?.(0.12 + charge * 0.22);
    }
  }

  // True only while Mooggy Swipe is the active melee (no weapon override). The
  // charge-on-hold loop in update.js uses this to decide whether to charge.
  function isMooggySwipeActive() {
    return !getEquippedWeapon() && getEquippedMove('melee') === 'mooggy_swipe';
  }

  // Release of a held Mooggy Swipe: spend a melee charge and swing scaled by how
  // long the button was held. Returns true if it fired (charge was available).
  function releaseMooggySwipe(chargeFactor = 0) {
    const move = getEquippedMove('melee');
    const attackSpeed = Neo.getAttackSpeedValue();
    if (!Neo.spendSkillCharge('melee', Neo.getMeleeCooldownDuration(move, attackSpeed))) return false;
    castMooggySwipe(chargeFactor);
    return true;
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
        bouncesRemaining: 3 + Neo.rollRicoceteBounces(itemStats.projectileBounces),
        hitOptions: { bleedChance: 0.08 },
      });
    }
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.3, ring: 22, c: '#c0d8ff' });
  }

  function castRandomPounce() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('smash');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRng = Neo.getAnvilMoveBonus(move, 'range');
    const aoeRadius = (160 + anvilRng) * (itemStats.aoeRadiusMultiplier || 1);
    const aoeDmgMult = itemStats.aoeDamageMultiplier || 1;
    const blastDmg = Math.round((Neo.godTimer > 0 ? 78 : 52) * aoeDmgMult) + anvilDmg;

    // Massive AOE explosion: strong trauma + big downward camera lurch + hitstop.
    Neo.addTrauma?.(0.9, Math.PI / 2, 30);
    Neo.addHitstop?.(0.07);
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, blastDmg, '#ff3070');
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, aoeRadius, '#ff3070', 'heavy');
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.5, ring: aoeRadius - 24, c: '#ff3070' });
    applyStatusInRadius(Neo.player.x, Neo.player.y, aoeRadius, 'bleed', 2, 5);

    const fangCount = 8;
    const targets = pickRandomEnemies(fangCount);
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
    // Landing slam: trauma shake with a downward camera lurch.
    Neo.addTrauma?.(0.66, Math.PI / 2, 20);
    Neo.addHitstop?.(0.05);
    Neo.player.inv = Math.max(Neo.player.inv, 0.32);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.44, ring: aoeRadius, c: '#ffe67a' });
  }

  function castCowardsWay() {
    Neo.player.cowardsWayTime = 3;
    Neo.player.inv = Math.max(Neo.player.inv, 0.25);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.72, text: "COWARD'S WAY", c: '#8dffcf' });
  }

  // Lightning left in the wake of a Zip dash: damages every enemy near the line
  // travelled from (x1,y1) to (x2,y2) and draws a jagged bolt along it.
  function strikeZipLine(x1, y1, x2, y2, lineDamage, lineRadius) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 4) return;
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const reach = lineRadius + length * 0.5;
    Neo.forEachEnemyNearCircle?.(midX, midY, reach + 80, enemy => {
      if (Neo.distToSegment(enemy.x, enemy.y, x1, y1, x2, y2) > lineRadius + enemy.r) return;
      const angle = Math.atan2(enemy.y - y1, enemy.x - x1);
      hitEnemy(enemy, lineDamage, angle, 150, '#95deff', { lightning: true });
    });
    if (typeof Neo.forEachDestructibleNearCircle === 'function') {
      Neo.forEachDestructibleNearCircle(midX, midY, reach + COMBAT_SPATIAL_PADDING, prop => {
        if (prop.broken || prop.hidden) return;
        if (Neo.distToSegment(prop.x, prop.y, x1, y1, x2, y2) > lineRadius + (prop.r || 12)) return;
        Neo.damageDestructible(prop, 2);
      });
    }
    Neo.spawnParticle({
      x: x1, y: y1, life: 0.26, c: '#bfe4ff',
      line: { x1, y1, x2, y2, w: 4.2, jag: 13, seg: Math.max(6, Math.round(length / 26)), phase: Neo.rng() * Math.PI * 2 },
    });
  }

  function castZipLightning(moveX, moveY) {
    const itemStats = Neo.getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = Neo.godTimer > 0 ? 34 : 26;
    const lineRadius = 46 * (itemStats.aoeRadiusMultiplier || 1);
    const lineDamage = Math.max(1, Math.round(baseDamage * 0.6));
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
      const fromX = sourceX;
      const fromY = sourceY;
      if (landing) teleportPlayerTo(landing.x, landing.y, '#95deff');
      sourceX = Neo.player.x;
      sourceY = Neo.player.y;
      performedHop = true;

      // Lightning streaks along the path the dash just travelled.
      strikeZipLine(fromX, fromY, Neo.player.x, Neo.player.y, lineDamage, lineRadius);

      const hitAngle = Math.atan2(target.y - Neo.player.y, target.x - Neo.player.x);
      hitEnemy(target, baseDamage, hitAngle, 185, '#95deff', { lightning: true });

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
          { rawDamage: true, lightning: true }
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
      const fromX = Neo.player.x;
      const fromY = Neo.player.y;
      const fallback = findSafePointNearTarget(Neo.player.x + Math.cos(angle) * 190, Neo.player.y + Math.sin(angle) * 190, Neo.player.r, 120, 16);
      if (fallback) {
        teleportPlayerTo(fallback.x, fallback.y, '#95deff');
        // No enemy to chain to — still leave a lightning trail along the dash.
        strikeZipLine(fromX, fromY, Neo.player.x, Neo.player.y, lineDamage, lineRadius);
      }
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
    forEachEnemyNearPlayer(radius, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, radius)) return;
      const enemyAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      enemy.vx += Math.cos(enemyAngle) * kickKnockback;
      enemy.vy += Math.sin(enemyAngle) * kickKnockback;
    });
    Neo.player.vx -= Math.cos(angle) * 260;
    Neo.player.vy -= Math.sin(angle) * 260;
    // Kick the camera back along the recoil direction (away from the strike).
    Neo.addTrauma?.(0.58, angle + Math.PI, 18);
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
    const isMetao = Neo.player?.character === 'metao';
    for (let index = 0; index < 8; index += 1) {
      const angle = index * (Math.PI * 2 / 8);
      Neo.spawnProjectile({
        x: Neo.player.x,
        y: Neo.player.y,
        vx: Math.cos(angle) * 440,
        vy: Math.sin(angle) * 440,
        r: 7,
        life: 1.8,
        enemy: false,
        kind: 'disk',
        damage: 20,
        hitOptions: isMetao ? { fireChance: 0.4, fireStacks: 1, fireDuration: 3 } : {},
        // Disks periodically shed faster sub-projectiles perpendicular to travel.
        subSpawn: {
          kind: 'disk_shard',
          interval: 0.18,
          timer: 0.18,
          speed: 620,
          r: 4,
          life: 0.7,
          damage: 8,
          count: 2,
          hitOptions: isMetao ? { fireChance: 0.25, fireStacks: 1, fireDuration: 2 } : {},
        },
      });
    }
  }

  function spawnFireballs() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const base = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      Neo.spawnProjectile({ x: Neo.player.x, y: Neo.player.y, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 * aoeRadiusMultiplier, splashDamage: Math.round(14 * aoeDamageMultiplier), blockedSplashDamage: Math.round(16 * aoeDamageMultiplier), fireStacks: 2, fireDuration: 3.4 });
    }
    // Recoil kick for the whole volley, along the aim direction (once, not per-fireball).
    const recoil = 150;
    Neo.player.vx -= Math.cos(base) * recoil;
    Neo.player.vy -= Math.sin(base) * recoil;
  }

  function castChaosBurst() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const isMetao = Neo.player?.character === 'metao';
    // Fire an immediate volley so the cast feels punchy...
    for (let index = 0; index < 4; index += 1) {
      spawnChaosBlast(Neo.player.x, Neo.player.y, aoeRadiusMultiplier, aoeDamageMultiplier, isMetao);
    }
    // ...then drop a lingering chaos field that keeps erupting random AOEs
    // around the player for several seconds (follows the player).
    Neo.hazards.push({
      kind: 'chaos_burst',
      x: Neo.player.x,
      y: Neo.player.y,
      r: 180 * aoeRadiusMultiplier,
      ttl: 1.8,
      tick: 0,
      interval: 0.22,
      followPlayer: true,
      aoeRadiusMultiplier,
      aoeDamageMultiplier,
      isMetao,
    });
  }

  // One random chaos AOE blast around (ox, oy). Shared by the initial cast
  // volley and the lingering chaos_burst hazard's per-tick eruptions.
  function spawnChaosBlast(ox, oy, aoeRadiusMultiplier, aoeDamageMultiplier, isMetao) {
    const angle = Neo.rng() * Math.PI * 2;
    const px = ox + Math.cos(angle) * Neo.rand(180, 30);
    const py = oy + Math.sin(angle) * Neo.rand(180, 30);
    Neo.spawnParticle({ x: px, y: py, life: 0.45, ring: 18 * aoeRadiusMultiplier, c: '#a857ff' });
    Neo.blastRadius(px, py, 52 * aoeRadiusMultiplier, Math.round(18 * aoeDamageMultiplier), '#a857ff');
    applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'poison', 1, 4.8);
    if (isMetao) applyStatusInRadius(px, py, 52 * aoeRadiusMultiplier, 'fire', 1, 3.5);
  }

  const JUSTICE_BLADE_LIFE = 2.1; // swords swing for 2.1s before despawning

  function castBladeOfJustice() {
    // Summon three flying swords that hover in front of the player and slash in
    // whatever direction the mouse points — control them like a laser. Each
    // sword swings (sweeps its tip back and forth) for 2.1 seconds, slicing
    // enemies it passes over, then despawns.
    const itemStats = Neo.getItemStats();
    const anvilBonus = Neo.getAnvilMoveBonus('blade_justice', 'damage') || 0;
    const baseDamage = (Neo.godTimer > 0 ? 30 : 22) + anvilBonus;
    const bladeDamage = Math.max(1, Math.round(baseDamage * (itemStats.beamDamageMultiplier || 1)));
    const aimAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    if (!Array.isArray(Neo.justiceBlades)) Neo.justiceBlades = [];
    const count = 3;
    for (let index = 0; index < count; index += 1) {
      // Fan the three swords across a forward arc; each keeps a fixed offset from
      // the formation's aim direction and swings around that.
      const fanOffset = (index - (count - 1) / 2) * 0.5;
      Neo.justiceBlades.push({
        index,
        fanOffset,
        aim: aimAngle,            // formation facing — eased toward the mouse each frame
        swingPhase: index * 0.7,  // desync the swings so they read as separate blades
        life: JUSTICE_BLADE_LIFE,
        maxLife: JUSTICE_BLADE_LIFE,
        damage: bladeDamage,
        radius: 16,
        reach: 120,               // how far in front of the player the sword orbits
        hitCooldowns: new Map(),  // per-enemy re-hit gate
        x: Neo.player.x,
        y: Neo.player.y,
        angle: aimAngle,
      });
    }
    Neo.shake = Math.max(Neo.shake, 6);
    Neo.shakeT = Math.max(Neo.shakeT, 0.1);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.4, ring: 30, c: '#fff6a3' });
  }

  // Per-frame flying-sword behaviour for Blade Justice.
  function updateJusticeBlades(dt) {
    const blades = Neo.justiceBlades;
    if (!Array.isArray(blades) || blades.length === 0) return;
    if (!Neo.player) { blades.length = 0; return; }

    // Whole formation tracks the mouse so the swords feel mouse-controlled.
    const mouseAim = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    let write = 0;
    for (let read = 0; read < blades.length; read += 1) {
      const blade = blades[read];
      blade.life -= dt;
      if (blade.life <= 0) continue; // drop it

      // Ease the blade's aim toward the mouse (smooth, controllable steering).
      blade.aim = Neo.turnAngleToward
        ? Neo.turnAngleToward(blade.aim, mouseAim, 9 * dt)
        : mouseAim;
      // Swing: the sword sweeps its angle around the aim direction.
      blade.swingPhase += dt * 7.5;
      const swing = Math.sin(blade.swingPhase) * 0.7;
      const dirAngle = blade.aim + blade.fanOffset + swing;
      // Position the sword out in front along its swing direction.
      const orbit = blade.reach * (0.82 + 0.18 * Math.cos(blade.swingPhase));
      blade.x = Neo.player.x + Math.cos(dirAngle) * orbit;
      blade.y = Neo.player.y + Math.sin(dirAngle) * orbit;
      // The blade points outward along its orbit (tip leads the sweep).
      blade.angle = dirAngle + Math.sign(Math.cos(blade.swingPhase)) * 0.5;

      // Decay per-enemy hit cooldowns.
      if (blade.hitCooldowns.size) {
        blade.hitCooldowns.forEach((value, key) => {
          const next = value - dt;
          if (next <= 0) blade.hitCooldowns.delete(key);
          else blade.hitCooldowns.set(key, next);
        });
      }

      // Damage enemies the sword body overlaps.
      Neo.forEachEnemyNearCircle?.(blade.x, blade.y, blade.radius + 80, enemy => {
        const hitRadius = blade.radius + enemy.r;
        if (Neo.dist(blade.x, blade.y, enemy.x, enemy.y) > hitRadius) return;
        if (blade.hitCooldowns.has(enemy)) return;
        blade.hitCooldowns.set(enemy, 0.22);
        const angle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
        hitEnemy(enemy, blade.damage, angle, 180, '#fff6a3', { lightning: false });
      });
      // Chip destructibles too.
      if (typeof Neo.forEachDestructibleNearCircle === 'function') {
        Neo.forEachDestructibleNearCircle(blade.x, blade.y, blade.radius + COMBAT_SPATIAL_PADDING, prop => {
          if (prop.broken || prop.hidden) return;
          if (Neo.dist(blade.x, blade.y, prop.x, prop.y) > blade.radius + (prop.r || 12)) return;
          if (blade.hitCooldowns.has(prop)) return;
          blade.hitCooldowns.set(prop, 0.4);
          Neo.damageDestructible(prop, 2);
        });
      }

      // Faint trailing sparkle.
      if (Neo.nextRandom('fx') < 0.5) {
        Neo.spawnParticle({ x: blade.x, y: blade.y, life: 0.18, c: '#fff6a3', spark: true, size: 2 });
      }

      blades[write++] = blade;
    }
    blades.length = write;
  }

  // Two lightning blades thrown straight ahead by the spear jab.
  function spawnSpearBlades(angle) {
    const itemStats = Neo.getItemStats();
    const baseDamage = (Neo.godTimer > 0 ? 24 : 18) * (itemStats.beamDamageMultiplier || 1);
    const bladeDamage = Math.max(1, Math.round(baseDamage));
    // A single straight lightning blade — toned down from the old splayed pair.
    spawnWeaponProjectile({
      x: Neo.player.x + Math.cos(angle) * 24,
      y: Neo.player.y + Math.sin(angle) * 24,
      angle,
      speed: 820,
      damage: bladeDamage,
      knockback: 80,
      r: 7,
      life: 0.5,
      kind: 'blade_justice',
      color: '#bfe4ff',
      pierceCount: 99,
      hitOptions: { lightning: true },
    });
  }

  function castSmiteChain() {
    const angle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    // Spear is a jab, not a swipe: a tight forward thrust rather than a wide arc.
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    Neo.player.stabSwing = true;

    // Physical thrust: a narrow forward stab that reaches a little further than a
    // swipe but only hits what is roughly in front of the player.
    const physicalDamage = 20;
    const stabArc = 0.45; // ~26 degrees to each side — tight, jab-like
    const smiteRange = Neo.ATTACKS.melee.range + 18;
    forEachEnemyNearPlayer(smiteRange, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, smiteRange)) return;
      const targetAngle = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > stabArc) return;
      hitEnemy(enemy, physicalDamage, angle, Neo.ATTACKS.melee.push, '#fff6a3', { lightning: true });
    });
    forEachDestructibleNearPlayer(smiteRange, prop => {
      if (prop.broken || prop.hidden) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, smiteRange)) return;
      const targetAngle = Math.atan2(prop.y - Neo.player.y, prop.x - Neo.player.x);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > stabArc) return;
      Neo.damageDestructible(prop, 2);
    });

    // The jab launches two lightning blades straight ahead (same flying-blade
    // projectiles as Blade Justice, but a tighter pair).
    spawnSpearBlades(angle);

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
        hitEnemy(current.ref, strikeDamage, Math.atan2(current.y - fromY, current.x - fromX), 90, '#dfe8ff', { lightning: true });
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
    let bestDistSq = radius * radius;

    const visitEnemy = enemy => {
      if (!enemy) return;
      if (exclude.has(enemy)) return;
      const dSq = distanceSq(x, y, enemy.x, enemy.y);
      if (dSq < bestDistSq) {
        best = { type: 'enemy', ref: enemy, x: enemy.x, y: enemy.y, r: enemy.r };
        bestDistSq = dSq;
      }
    };

    const visitProp = prop => {
      if (prop.broken || prop.hidden || exclude.has(prop)) return;
      const dSq = distanceSq(x, y, prop.x, prop.y);
      if (dSq < bestDistSq) {
        best = { type: 'prop', ref: prop, x: prop.x, y: prop.y, r: prop.r };
        bestDistSq = dSq;
      }
    };

    if (typeof Neo.forEachEnemyNearCircle === 'function') Neo.forEachEnemyNearCircle(x, y, radius, visitEnemy);
    else Neo.enemies.forEach(visitEnemy);

    if (typeof Neo.forEachDestructibleNearCircle === 'function') Neo.forEachDestructibleNearCircle(x, y, radius, visitProp);
    else Neo.destructibles.forEach(visitProp);

    return best;
  }

  function castHealingZone(chargeRatio = 0) {
    const aoeRadiusMultiplier = Neo.getItemStats().aoeRadiusMultiplier || 1;
    // A full 5s charge roughly doubles the radius and ttl and boosts heal/damage.
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const radius = 62 * aoeRadiusMultiplier * (1 + charge);
    const ttl = 6 * (1 + charge);
    Neo.hazards.push({
      kind: 'healing_zone',
      x: Neo.player.x,
      y: Neo.player.y,
      r: radius,
      ttl,
      healTick: 0.24,
      healAccum: 0,
      plusTick: 0.08,
      healMult: 1 + charge * 1.2,
      damageMult: 1 + charge * 1.5,
    });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.7, ring: radius * 0.5, c: '#35ff6f' });
    if (charge > 0.05) {
      Neo.shake = Math.max(Neo.shake, 4 + charge * 6);
      Neo.shakeT = Math.max(Neo.shakeT, 0.14);
    }
  }

  // Drives the Healing Zone charge: grows while the smash input is held (capped
  // at 5s), then releases a zone scaled by how long it was held.
  function updateHealingZoneCharge(dt) {
    if (!Neo.healingZoneCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      // Bail out cleanly (e.g. on death / room change) — refund the cooldown timer.
      Neo.healingZoneCharging = false;
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      return;
    }
    Neo.healingZoneChargeTime = Math.min(
      HEALING_ZONE_MAX_CHARGE,
      Number(Neo.healingZoneChargeTime || 0) + dt
    );
    const atMax = Neo.healingZoneChargeTime >= HEALING_ZONE_MAX_CHARGE;
    // Charge tier sparkle so the player can read the wind-up.
    if (Neo.nextRandom('fx') < 0.6) {
      const ratio = Neo.healingZoneChargeTime / HEALING_ZONE_MAX_CHARGE;
      const ring = 18 + ratio * 48;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.22, ring, c: '#47ff7d' });
    }
    // Release when the key is let go, or auto-release at full charge.
    if (!Neo.smashHeld || atMax) {
      const ratio = Neo.healingZoneChargeTime / HEALING_ZONE_MAX_CHARGE;
      castHealingZone(ratio);
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      Neo.healingZoneCharging = false;
      Neo.healingZoneChargeTime = 0;
    }
  }

  function castFireCircle() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    Neo.hazards.push({ kind: 'fire_circle', x: Neo.player.x, y: Neo.player.y, r: 96 * aoeRadiusMultiplier, ttl: 5.2, dps: 18 * aoeDamageMultiplier, followPlayer: true });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.55, ring: 34, c: '#ff7b32' });
  }

  function castFloorLava() {
    Neo.player.lavaWalkTime = 7.5;
    Neo.player.lavaTrailTick = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 12, life: 0.7, text: 'LAVA WALK', c: '#ff9f40' });
  }

  // Mooggy Hairball Blast: a venomous AOE that bursts for heavy poison and
  // freezes everything caught in it.
  function castMooggyHairball() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const radius = 132 * aoeRadiusMultiplier;
    const damage = Math.round(34 * aoeDamageMultiplier);
    Neo.addTrauma?.(0.6, Math.PI / 2, 18);
    Neo.addHitstop?.(0.05);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.45, ring: radius - 24, c: '#85df63' });
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, radius, '#85df63', 'heavy');
    Neo.blastRadius(Neo.player.x, Neo.player.y, radius, damage, '#85df63');
    applyStatusInRadius(Neo.player.x, Neo.player.y, radius, 'poison', 3, 6);
    forEachEnemyNearPlayer(radius, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, radius)) return;
      freezeEnemy(enemy, 0.8);
    });
    // Cough up a few drifting hairball gobs for flavour.
    for (let index = 0; index < 10; index += 1) {
      const angle = Neo.rng() * Math.PI * 2;
      const speed = Neo.rand(60, 220, 'fx');
      Neo.spawnParticle({
        x: Neo.player.x, y: Neo.player.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.4 + Neo.rng() * 0.3, c: '#9be36f', size: 2.6,
      });
    }
  }

  // Mateo Potion Bath: full cleanse + 20s status resistance, heal 60% with a
  // short regen, vanish for 5s, and erupt in explosions around the caster.
  function castPotionBath() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    // Cleanse every damaging/cold status off the player.
    Neo.STATUS_KEYS.forEach(key => Neo.clearStatus(Neo.player, key));
    // Resist new statuses for 20s and become hidden + invulnerable for 5s.
    Neo.player.statusResistTime = Math.max(Number(Neo.player.statusResistTime || 0), 20);
    Neo.player.warpHideTime = Math.max(Number(Neo.player.warpHideTime || 0), 5);
    Neo.player.inv = Math.max(Number(Neo.player.inv || 0), 5);
    // Heal 60% of max HP now, then regen over the next 5 seconds.
    const burst = Neo.applyPlayerHealing(Math.round(Neo.player.maxHp * 0.6));
    if (burst > 0) Neo.spawnHealPopup(Neo.player.x, Neo.player.y - 22, burst, { color: '#9af7d8' });
    Neo.player.potionRegenTime = 5;
    Neo.player.potionRegenAccum = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'POTION BATH', c: '#9af7d8' });
    Neo.addTrauma?.(0.7, Math.PI / 2, 20);
    // Explosions around you.
    const burstRadius = 56 * aoeRadiusMultiplier;
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + Neo.rng() * 0.4;
      const dist = Neo.rand(40, 150, 'fx');
      const px = Neo.player.x + Math.cos(angle) * dist;
      const py = Neo.player.y + Math.sin(angle) * dist;
      Neo.spawnParticle({ x: px, y: py, life: 0.5, ring: 22 * aoeRadiusMultiplier, c: '#b6f0ff' });
      Neo.blastRadius(px, py, burstRadius, Math.round(30 * aoeDamageMultiplier), '#b6f0ff');
    }
  }

  const EXCALIBUR_FALL_TIME = 0.34;   // descent before impact
  const EXCALIBUR_HOVER_TIME = 0.7;   // brief spin-in-place flourish after impact
  const EXCALIBUR_STRIKE_RADIUS = 150; // swords cluster within this of the cursor

  // Gelleh Summon Excalibur: a focused volley of divine swords that plunge from
  // the ceiling around the aimed point, slam for AOE, then spin in place for a
  // brief flourish before dissipating. A strong AIMED strike — it does not chase
  // enemies or sweep the whole room.
  function castExcaliburStrike() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    if (!Array.isArray(Neo.skySwords)) Neo.skySwords = [];
    const count = 5;
    const edgePad = Neo.WALL + 24;
    const slamDamage = Math.round((Neo.godTimer > 0 ? 58 : 46) * aoeDamageMultiplier);
    const cx = Neo.clamp(Neo.mouse.worldX, edgePad, Neo.ROOM_W - edgePad);
    const cy = Neo.clamp(Neo.mouse.worldY, edgePad, Neo.ROOM_H - edgePad);
    const cluster = EXCALIBUR_STRIKE_RADIUS * aoeRadiusMultiplier;
    for (let index = 0; index < count; index += 1) {
      // First sword hits the cursor exactly; the rest cluster tightly around it.
      const offAngle = Neo.rng() * Math.PI * 2;
      const offDist = index === 0 ? 0 : Neo.rand(28, cluster, 'fx');
      const tx = Neo.clamp(cx + Math.cos(offAngle) * offDist, edgePad, Neo.ROOM_W - edgePad);
      const ty = Neo.clamp(cy + Math.sin(offAngle) * offDist, edgePad, Neo.ROOM_H - edgePad);
      Neo.skySwords.push({
        x: tx, y: ty,
        phase: 'falling',
        delay: index * 0.07,          // stagger the rain
        fall: EXCALIBUR_FALL_TIME,
        radius: 76 * aoeRadiusMultiplier,
        damage: slamDamage,
        // Hover flourish state (spins in place, no tracking):
        hoverTime: EXCALIBUR_HOVER_TIME,
        angle: Neo.rng() * Math.PI * 2,
        spin: (Neo.rng() < 0.5 ? -1 : 1) * (5 + Neo.rng() * 3),
      });
    }



    Neo.spawnParticle({ x: cx, y: cy, life: 0.5, ring: 36, c: '#ffd980' });
    Neo.addTrauma?.(0.4, Math.PI / 2, 12);
  }

  // Per-frame update for the Excalibur blades: fall → slam → fly/seek → fade.
  function updateSkySwords(dt) {
    const swords = Neo.skySwords;
    if (!Array.isArray(swords) || swords.length === 0) return;
    let write = 0;
    for (let read = 0; read < swords.length; read += 1) {
      const sword = swords[read];
      if (sword.delay > 0) {
        sword.delay -= dt;
        swords[write++] = sword;
        continue;
      }
      if (sword.phase === 'falling') {
        sword.fall -= dt;
        if (Neo.nextRandom('fx') < 0.7) {
          const ratio = Neo.clamp(sword.fall / EXCALIBUR_FALL_TIME, 0, 1);
          Neo.spawnParticle({ x: sword.x, y: sword.y, life: 0.18, ring: 16 + ratio * 60, c: '#ffe6a3' });
        }
        if (sword.fall <= 0) {
          // Impact slam — the only damage this ability deals.
          sword.phase = 'hover';
          Neo.addTrauma?.(0.5, Math.PI / 2, 14);
          Neo.addHitstop?.(0.04);
          Neo.spawnAoeShockwave(sword.x, sword.y, sword.radius, '#ffd980', 'heavy');
          Neo.blastRadius(sword.x, sword.y, sword.radius, sword.damage, '#ffd980');
          Neo.spawnParticle({ x: sword.x, y: sword.y, life: 0.5, ring: sword.radius, c: '#fff1c2' });
        }
        swords[write++] = sword;
        continue;
      }
      if (sword.phase === 'hover') {
        // Brief flourish: the embedded blade spins in place (no movement, no
        // tracking, no extra damage) then fades.
        sword.hoverTime -= dt;
        sword.angle += sword.spin * dt;
        if (Neo.nextRandom('fx') < 0.3) {
          Neo.spawnParticle({ x: sword.x, y: sword.y, life: 0.16, c: '#ffe6a3', spark: true, size: 2 });
        }
        if (sword.hoverTime <= 0) { sword.phase = 'fade'; sword.fadeT = 0.3; }
        swords[write++] = sword;
        continue;
      }
      // Fade phase: brief afterglow then drop.
      sword.fadeT -= dt;
      if (sword.fadeT > 0) swords[write++] = sword;
    }
    swords.length = write;
  }

  // Gelleh Holy Turrets: summon a ring of divine turrets that auto-fire holy
  // AOE bursts at nearby enemies for a few seconds.
  function castHolyTurrets() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const count = 3;
    const baseAngle = Math.atan2(Neo.mouse.worldY - Neo.player.y, Neo.mouse.worldX - Neo.player.x);
    const edgePad = Neo.WALL + 16;
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + (index - (count - 1) / 2) * 0.7;
      const tx = Neo.clamp(Neo.player.x + Math.cos(angle) * 74, edgePad, Neo.ROOM_W - edgePad);
      const ty = Neo.clamp(Neo.player.y + Math.sin(angle) * 74, edgePad, Neo.ROOM_H - edgePad);
      Neo.hazards.push({
        kind: 'holy_turret',
        x: tx,
        y: ty,
        r: 26,
        ttl: 6,
        tick: 0,
        interval: 0.6,
        range: 360,
        burstRadius: 56 * aoeRadiusMultiplier,
        damage: Math.round(26 * aoeDamageMultiplier),
        aimAngle: angle,
        recoil: 0,
      });
      Neo.spawnParticle({ x: tx, y: ty, life: 0.5, ring: 22, c: '#fff1b0' });
    }
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
    // Enemies lose track of the player during the warp phase-out window.
    Neo.player.warpHideTime = Math.max(Number(Neo.player.warpHideTime || 0), 0.6);
  }

  // How strongly an enemy resists crowd control (knockback + stun). Grows with how
  // far/long the run has gone (cumulative floors entered + elapsed minutes), scaled
  // by the difficulty's ccResistScale (easy ~negligible, hard+ steep), with an extra
  // bump for bosses/elites. No cap — deep/late enemies can become CC-immune.
  // hard (ccResistScale 0.30) reaches ~1.0 after roughly one full loop, which halves
  // applied knockback via the 1/(1+level) factor in hitEnemy().
  function getEnemyCcLevel(enemy) {
    const diff = Neo.getDifficultyDef?.() || {};
    const scale = Number(diff.ccResistScale ?? 0);
    const isBoss = Neo.isBossType?.(enemy?.type) || enemy?.type === 'god';
    const isElite = !!enemy?.elite;
    if (scale <= 0 && !isBoss && !isElite) return 0;
    const depth = Neo.getProgressionDepth ? Neo.getProgressionDepth() : Math.max(1, Number(Neo.floor) || 1);
    const minutes = Math.max(0, Number(Neo.gameElapsedTime || 0) / 60);
    const progress = (depth - 1) / Neo.MAX_FLOOR + minutes / 6;
    let level = scale * progress;
    if (isBoss) level += 0.6;
    else if (isElite) level += 0.3;
    return Math.max(0, level);
  }
  Neo.getEnemyCcLevel = getEnemyCcLevel;

  function applyEnemyImpactStun(enemy, dealt, appliedKnockback) {
    const maxHealth = Number(enemy?.max) || 0;
    // Base stun resistance (e.g. elite anchor_charm) plus the depth/time/difficulty
    // scaling, so deep/late enemies are stunned less often and for less time.
    const stunResistance = Math.max(0, Number(enemy?.stunResistance || 0)) + getEnemyCcLevel(enemy);
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
    const now = Number(Neo.gameElapsedTime || 0);
    if (now < Number(enemy?.heavyStunImmuneUntil || 0)) return false;
    stunDuration *= durationMultiplier;
    if (Neo.BOSS_TYPES.has(enemy.type)) stunDuration *= Neo.HEAVY_IMPACT_BOSS_STUN_MULTIPLIER;
    enemy.stun = Math.max(enemy.stun || 0, stunDuration);
    enemy.heavyStunImmuneUntil = now + 0.35;
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
    const statusSeverity = Number(stats.negativeStatusMultiplier || 1);
    Neo.player.stun = Math.max(Number(Neo.player.stun || 0), stunDuration * durationMultiplier * statusSeverity);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - Neo.player.r - 18, life: 0.55, text: 'STUN', c: '#ffe66d' });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y, life: 0.36, ring: Neo.player.r + 18, c: '#ffe66d' });
    return true;
  }

  // Tooth of Thorn lifesteal: a small chance per hit to heal 1 when below max HP.
  // Lives on its own so multi-beam moves (Thorn's Infinite Blood Beam) can roll it
  // once per beam that lands, instead of once per tick after the damage dedup.
  function rollToothOfThornDrain(enemy, cachedStats) {
    const stats = cachedStats || Neo.getItemStats();
    if (!(stats.drainChance > 0)) return;
    if (!Neo.player || Neo.player.hp >= Neo.player.maxHp) return;
    if (Neo.nextRandom('encounter') >= stats.drainChance) return;
    const heal = Neo.scalePlayerHealing(1, 1);
    const gained = Neo.applyPlayerHealing(heal);
    if (gained > 0) {
      Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ff8fb4', size: 13 });
    }
  }

  function hitEnemy(enemy, damage, angle, knockback, color, options = {}) {
    if ((enemy?.inv || 0) > 0) return;
    // Befriended rivals (healed by the player) cannot be hurt at all.
    if (enemy?.type === 'rival' && enemy.rivalData?.friend) {
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 22, life: 0.45, text: 'FRIEND', c: '#8dffbd' });
      return;
    }
    const stats = Neo.getItemStats();
    const sandbox = Neo.getActiveSandboxSettings();
    const critChance = Neo.clamp((stats.critChance || 0) + Number(options.critBonus || 0), 0, 0.98);
    let dealt = options.rawDamage ? scaleRawDamageAgainstEnemy(enemy, damage) : scaleDamageAgainstEnemy(enemy, damage, options, stats);
    // Copper Penny: every electric/lightning hit deals +20% damage per stack and
    // builds a stacking Static charge on the target. Static is a DoT that arcs to
    // nearby foes (see updateEnemyStatuses), so electric builds chain through packs.
    const copperPennyStacks = options.lightning ? (Neo.getItemCount?.('copper_penny') || 0) : 0;
    if (copperPennyStacks > 0) dealt = Math.max(1, Math.round(dealt * (1 + copperPennyStacks * 0.2)));
    if (sandbox) dealt = Math.max(1, Math.round(dealt * sandbox.playerDamageMultiplier));
    // Sparkle Charm marks enemies so every hit against them is a guaranteed crit.
    const sparkled = Number(enemy.critSparkle || 0) > 0;
    const isCrit = sparkled || (critChance > 0 && Neo.nextRandom('encounter') < critChance);
    // Higher-level enemies (deeper/later runs, scaled by difficulty) resist
    // knockback: the impulse is divided by 1+ccLevel, so they need a bigger hit to
    // be moved and to cross the heavy-knockback stun threshold. No cap.
    const knockbackResistFactor = 1 / (1 + getEnemyCcLevel(enemy));
    const appliedKnockback = knockback * (stats.knockbackMultiplier || 1) * knockbackResistFactor;
    if (isCrit) dealt = Math.round(dealt * stats.critMultiplier);
    if (!options.ignoreBarrier && (enemy.barrier || 0) > 0) {
      const absorbed = Math.min(enemy.barrier, dealt);
      enemy.barrier -= absorbed;
      dealt -= absorbed;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 20, life: 0.4, text: `BLOCK ${absorbed}`, c: '#7ed6ff' });
      if (dealt <= 0) {
        enemy.vx += Math.cos(angle) * appliedKnockback * 0.35;
        enemy.vy += Math.sin(angle) * appliedKnockback * 0.35;
        applyEnemyImpactStun(enemy, 0, appliedKnockback * 0.35);
        return;
      }
    }
    enemy.hp -= dealt;
    enemy.vx += Math.cos(angle) * appliedKnockback;
    enemy.vy += Math.sin(angle) * appliedKnockback;
    if (Number.isFinite(angle)) {
      enemy._lastHitAngle = angle;
      enemy._lastHitAt = performance.now();
    }
    applyEnemyImpactStun(enemy, dealt, appliedKnockback);
    if (!options.noCharmBuff) Neo.grantCritCharmBuff();
    // Continuous beams call hitEnemy on the same target several times a second.
    // Damage/knockback/popups still apply every tick, but throttle the cosmetic
    // hit fleck + blood spray per enemy so a held laser can't flood particles.
    const perfMode = window.NeoSettings?.isPerformanceMode?.() !== false;
    const allowHitFx = !(perfMode && options.beamFx) || canTriggerStatusReaction(enemy, 'beamHitFx', 7);
    if (allowHitFx) {
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.24, vx: Neo.rand(-30, 30, 'fx'), vy: Neo.rand(-30, 30, 'fx'), c: color });
      if (shouldBloodOnHit() && options.bloodOnHit !== false) {
        spawnBleedSpray(enemy, 1, isCrit ? 1.2 : 0.72);
      }
      Neo.playSfx?.('enemy_hit');
    }
    // Game feel: directional trauma scaled to impact (vs target max HP).
    // Chip damage gets nothing; crits and big slams get a kick away from the blow.
    applyHitFeel(enemy, dealt, angle, isCrit);
    Neo.spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      enemy,
    });
    // Multi-beam callers (Thorn's fan) roll drain per beam themselves; skip the
    // shared roll so the beam that also lands the dedup'd hit isn't counted twice.
    if (!options.skipDrainRoll) rollToothOfThornDrain(enemy, stats);
    if (stats.confuseRayStunChance > 0 && Neo.nextRandom('encounter') < stats.confuseRayStunChance) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.55);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STUN', c: '#ffe66d' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.28, ring: enemy.r + 12, c: '#ffe66d' });
    }
    // Snake Knife poisons on ANY hit (melee or ranged), so it lives on the shared
    // hit path rather than inside individual melee moves.
    if (stats.snakeKnifePoisonChance > 0 && Neo.nextRandom('encounter') < stats.snakeKnifePoisonChance) {
      applyPoison(enemy, 1, 4);
    }
    // Weapon Fatigue chills on ANY hit too: a slow stack, plus a smaller chance to
    // briefly freeze (hard stun) the target solid.
    if (stats.weaponFatigueChance > 0 && Neo.nextRandom('encounter') < stats.weaponFatigueChance) {
      Neo.applyStatus(enemy, 'slow', 1, 4);
    }
    if (stats.weaponFatigueFreezeChance > 0 && Neo.nextRandom('encounter') < stats.weaponFatigueFreezeChance) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.6);
      Neo.applyStatus(enemy, 'slow', 1, 4);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'FROZEN', c: '#9fe8ff' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.3, ring: enemy.r + 12, c: '#9fe8ff' });
    }
    if (stats.overstimulateStunChance > 0 && (Neo.getActiveStatusCount?.(enemy) || 0) >= 2 && Neo.nextRandom('encounter') < stats.overstimulateStunChance) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 1.4);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STIMULATED', c: '#ffd27d' });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.28, ring: enemy.r + 12, c: '#ffd27d' });
    }
    if (options.lightning && Neo.getStatusStacks?.(enemy, 'slow') > 0 && Neo.nextRandom('encounter') < 0.35) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.62);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.48, text: 'SHOCK', c: '#9adfff' });
    }
    // Copper Penny: lightning hits build a Static charge on the target. One stack
    // per hit (it stacks well), refreshing the duration. The DoT and the arc to
    // nearby foes are handled in updateEnemyStatuses.
    if (copperPennyStacks > 0 && !options.noStatic) {
      applyStatic(enemy, 1, 4);
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
    // Procy Pickle: a crit can fling the target's statuses onto nearby enemies.
    if (isCrit && enemy.hp > 0) procyPickleSpread(enemy);
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
      hitEnemy(nextEnemy, chainDamage, Math.atan2(nextEnemy.y - source.y, nextEnemy.x - source.x), 55, color, { beamFx: true });
      Neo.spawnParticle({ x: (source.x + nextEnemy.x) / 2, y: (source.y + nextEnemy.y) / 2, life: 0.22, c: '#d890ff' });
      source = nextEnemy;
    }
  }

  function getStatusReactionFrameState(enemy) {
    if (!enemy.statusReactionFrames || typeof enemy.statusReactionFrames !== 'object') {
      enemy.statusReactionFrames = {};
    }
    return enemy.statusReactionFrames;
  }

  function canTriggerStatusReaction(enemy, key, frameGap = 28) {
    const state = getStatusReactionFrameState(enemy);
    const now = Number(Neo.frameId || 0);
    const last = Number(state[key] || -9999);
    if (now - last < frameGap) return false;
    state[key] = now;
    return true;
  }

  function applyDirectReactionDamage(enemy, damage, color, label = '') {
    if (!enemy || enemy.dead || damage <= 0) return;
    const dealt = scaleRawDamageAgainstEnemy(enemy, damage);
    enemy.hp -= dealt;
    Neo.spawnDamagePopup(enemy.x, enemy.y - 12, dealt, { color, size: 15 });
    if (label) Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.42, text: label, c: color });
    if (enemy.hp <= 0) onEnemyDie(enemy);
  }

  function triggerStatusReactions(entity, appliedKey) {
    if (!entity || entity === Neo.player || entity.dead) return;
    const stats = Neo.getItemStats();
    const aoeMult = Number(stats.aoeRadiusMultiplier || 1);
    const bleedStacks = Neo.getStatusStacks(entity, 'bleed');
    const fireStacks = Neo.getStatusStacks(entity, 'fire');
    const poisonStacks = Neo.getStatusStacks(entity, 'poison');
    const darkStacks = Neo.getStatusStacks(entity, 'dark_drain');

    if ((appliedKey === 'fire' || appliedKey === 'poison') && fireStacks > 0 && poisonStacks > 0 && canTriggerStatusReaction(entity, 'toxic_burst', 44)) {
      const radius = 46 * aoeMult;
      const damage = 10 + fireStacks * 2 + poisonStacks * 2;
      applyDirectReactionDamage(entity, damage, '#aaff67', 'TOXIC');
      if (!entity.dead) {
        Neo.blastRadius(entity.x, entity.y, radius, Math.max(5, Math.round(damage * 0.55)), '#aaff67', entity);
        Neo.applyStatusInRadius(entity.x, entity.y, radius, 'poison', 1, 3.2, entity);
      }
    }

    if ((appliedKey === 'bleed' || appliedKey === 'poison') && bleedStacks > 0 && poisonStacks > 0 && canTriggerStatusReaction(entity, 'venom_bleed', 36)) {
      const poisonState = Neo.getStatusState(entity, 'poison');
      poisonState.tick = Math.min(Number(poisonState.tick || 0.7), 0.16);
      applyDirectReactionDamage(entity, 4 + bleedStacks + poisonStacks, '#b7ff70', 'VENOM');
    }

    if ((appliedKey === 'fire' || appliedKey === 'bleed') && fireStacks > 0 && bleedStacks > 0 && canTriggerStatusReaction(entity, 'cauterize_pop', 52)) {
      const bleedState = Neo.getStatusState(entity, 'bleed');
      bleedState.stacks = Math.max(0, Number(bleedState.stacks || 0) - 1);
      applyDirectReactionDamage(entity, 8 + bleedStacks * 2 + fireStacks, '#ffb35c', 'POP');
      Neo.spawnParticle({ x: entity.x, y: entity.y, life: 0.24, ring: entity.r + 18, c: '#ffb35c' });
    }

    if (appliedKey !== 'dark_drain' && darkStacks > 0 && Neo.player && canTriggerStatusReaction(entity, 'dark_siphon', 34)) {
      Neo.applyPlayerHealing?.(Math.max(0.5, darkStacks * 0.65), { showBarrier: false });
      Neo.spawnParticle({ x: entity.x, y: entity.y - 8, life: 0.24, c: '#b48cff' });
    }

    // Procy Pickle: whenever a status-applying item procs a status onto this enemy,
    // roll to spread that enemy's whole status cocktail to its neighbours.
    if (Number(stats.procyPickleSpreadChance || 0) > 0) procyPickleSpread(entity);
  }

  function applyBleed(enemy, stacks, duration, source = null) {
    if (!enemy) return;
    const beforeStacks = Neo.getStatusStacks(enemy, 'bleed');
    const adjustedDuration = Number(duration || 0) * (enemy === Neo.player ? 1 : Number(Neo.getItemStats?.()?.statusDurationMultiplier || 1));
    Neo.applyStatus(enemy, 'bleed', stacks, adjustedDuration, source);
    const afterStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (afterStacks > beforeStacks) {
      enemy.bleedFlash = 0.34;
      spawnBleedSpray(enemy, afterStacks - beforeStacks, 1.7);
    }
    triggerStatusReactions(enemy, 'bleed');
  }

  function applyFire(entity, stacks, duration, source = null) {
    const characterBoost = Neo.player?.character === 'metao' && entity !== Neo.player ? 1.15 : 1;
    const statusBoost = entity === Neo.player ? 1 : Number(Neo.getItemStats?.()?.statusDurationMultiplier || 1);
    const adjustedDuration = Number(duration || 0) * statusBoost * characterBoost;
    Neo.applyStatus(entity, 'fire', stacks, adjustedDuration, source);
    triggerStatusReactions(entity, 'fire');
  }

  function applyPoison(entity, stacks, duration, source = null) {
    const characterBoost = Neo.player?.character === 'metao' && entity !== Neo.player ? 1.15 : 1;
    const statusBoost = entity === Neo.player ? 1 : Number(Neo.getItemStats?.()?.statusDurationMultiplier || 1);
    const adjustedDuration = Number(duration || 0) * statusBoost * characterBoost;
    Neo.applyStatus(entity, 'poison', stacks, adjustedDuration, source);
    triggerStatusReactions(entity, 'poison');
  }

  function applyDarkDrain(entity, stacks, duration, source = null) {
    const adjustedDuration = Number(duration || 0) * (entity === Neo.player ? 1 : Number(Neo.getItemStats?.()?.statusDurationMultiplier || 1));
    Neo.applyStatus(entity, 'dark_drain', stacks, adjustedDuration, source);
    triggerStatusReactions(entity, 'dark_drain');
  }

  // Static (Copper Penny): a stacking electric DoT that arcs to nearby foes. Only
  // applied to enemies — it's a player-built status, never inflicted on the player.
  function applyStatic(entity, stacks, duration, source = null) {
    if (!entity || entity === Neo.player) return;
    const adjustedDuration = Number(duration || 0) * Number(Neo.getItemStats?.()?.statusDurationMultiplier || 1);
    Neo.applyStatus(entity, 'static', stacks, adjustedDuration, source);
    triggerStatusReactions(entity, 'static');
  }

  // Shared "freeze" effect: a brief hard stun plus a cold (slow) stack and the
  // FROZEN popup. Mirrors the Weapon Fatigue freeze so frozen reads the same
  // everywhere.
  function freezeEnemy(enemy, stunDuration = 0.6) {
    if (!enemy) return;
    enemy.stun = Math.max(Number(enemy.stun || 0), stunDuration);
    Neo.applyStatus(enemy, 'slow', 1, 4);
    Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'FROZEN', c: '#9fe8ff' });
    Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.3, ring: enemy.r + 12, c: '#9fe8ff' });
  }

  function applyStatusInRadius(x, y, radius, statusKey, stacks, duration, sourceEnemy = null) {
    const stats = Neo.getItemStats?.() || {};
    const adjustedDuration = Number(duration || 0) * Number(stats.aoeStatusDurationMultiplier || 1);
    const visitEnemy = enemy => {
      if (!enemy) return;
      if (sourceEnemy && enemy === sourceEnemy) return;
      if (!isWithinRadiusSq(x, y, enemy, radius)) return;
      Neo.applyStatus(enemy, statusKey, stacks, adjustedDuration);
      triggerStatusReactions(enemy, statusKey);
    };
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(x, y, radius + 80, visitEnemy, { excludeEnemy: sourceEnemy });
    } else {
      Neo.enemies.forEach(visitEnemy);
    }
  }

  // Procy Pickle: copy every damaging status currently on `source` onto nearby
  // enemies, so a single crit/proc can chain a build's bleeds, fires and poisons
  // across a pack. Throttled per source so held beams can't spam it.
  // `procyPickleSpreading` guards against runaway recursion: applying statuses to
  // the spread targets re-enters triggerStatusReactions, and we don't want that to
  // kick off a fresh spread on every neighbour in the same frame.
  let procyPickleSpreading = false;
  function procyPickleSpread(source, options = {}) {
    if (procyPickleSpreading) return;
    if (!source || source === Neo.player || source.dead) return;
    const stats = Neo.getItemStats?.() || {};
    const chance = Number(stats.procyPickleSpreadChance || 0);
    if (chance <= 0) return;
    if (!options.guaranteed && Neo.nextRandom('encounter') >= chance) return;
    if (!canTriggerStatusReaction(source, 'procy_pickle_spread', 26)) return;
    const carried = Neo.STATUS_KEYS.filter(key => Neo.getStatusStacks(source, key) > 0);
    if (!carried.length) return;
    const radius = 130 * Number(stats.aoeRadiusMultiplier || 1);
    let spread = false;
    const visitEnemy = enemy => {
      if (!enemy || enemy === source || enemy.dead) return;
      if (!isWithinRadiusSq(source.x, source.y, enemy, radius)) return;
      carried.forEach(key => {
        // Spread one stack of each carried status, with the source's remaining
        // duration so the copy isn't a permanent fresh DoT.
        const duration = Math.max(1.6, Number(Neo.getStatusState(source, key)?.duration || 0) * 0.6);
        Neo.applyStatus(enemy, key, 1, duration);
        triggerStatusReactions(enemy, key);
      });
      spread = true;
    };
    procyPickleSpreading = true;
    try {
      if (typeof Neo.forEachEnemyNearCircle === 'function') {
        Neo.forEachEnemyNearCircle(source.x, source.y, radius + 80, visitEnemy, { excludeEnemy: source });
      } else {
        Neo.enemies.forEach(visitEnemy);
      }
    } finally {
      procyPickleSpreading = false;
    }
    if (spread) {
      Neo.spawnParticle({ x: source.x, y: source.y, life: 0.3, ring: source.r + 22, c: '#9be25a' });
      Neo.spawnParticle({ x: source.x, y: source.y - source.r - 14, life: 0.4, text: 'SPREAD', c: '#cdf58f' });
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
      // Capture originals first — otherwise the hp fallback below would read the
      // already-doubled max and quadruple hp when the stored hp is falsy.
      const baseMax = Number(enemy.max || enemy.hp || 1);
      const baseHp = Number(enemy.hp || enemy.max || 1);
      enemy.max = Math.max(1, Math.round(baseMax * 2));
      enemy.hp = Math.max(1, Math.round(baseHp * 2));
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
      const stats = config.stats || Neo.getItemStats?.() || {};
      let damage = scaleRawDamageAgainstEnemy(enemy, Math.max(1, Math.round(config.damage(state.stacks, stats))));
      if (Neo.isChallengeActive?.('cursed_blood')) damage = Math.max(1, Math.round(damage * 1.35));
      const bleedCrit = key === 'bleed' && Number(stats.bleedCritChance || 0) > 0 && Neo.nextRandom('encounter') < Number(stats.bleedCritChance || 0);
      if (bleedCrit) damage = Math.max(1, Math.round(damage * Number(stats.critMultiplier || 1.6)));
      enemy.hp -= damage;
      Neo.spawnDamagePopup(enemy.x, enemy.y - 10, damage, { color: config.color, size: bleedCrit ? 18 : 15, crit: bleedCrit });
      if (bleedCrit) Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 14, life: 0.38, text: 'BLEED CRIT', c: config.color });
      if (config.particleColor) {
        Neo.spawnParticle({ x: enemy.x + Neo.rand(-8, 8), y: enemy.y + Neo.rand(-8, 8), life: 0.25, c: config.particleColor });
      }
      if (key === 'bleed') spawnBleedSpray(enemy, state.stacks, 0.7);
      if (config.healScale > 0 && Neo.player && Neo.player.hp < Neo.player.maxHp) {
        const heal = Neo.scalePlayerHealing(damage * config.healScale);
        const gained = Neo.applyPlayerHealing(heal);
        if (gained > 0.2) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-8, 8), Neo.player.y - 22, gained, { color: config.color });
      }
      if (enemy.hp <= 0) {
        onEnemyDie(enemy);
        return true;
      }
      if (typeof config.onTick === 'function') config.onTick(enemy, state, stats);
    }
    if (state.duration <= 0) Neo.clearStatus(enemy, key);
    return false;
  }

  // Snake Knife's poison is naturally infectious: each tick has a 1% chance to
  // jump one stack to the nearest healthy foe, so a poison build slowly seeds a
  // whole pack without needing Procy Pickle. Guarded so it doesn't chain-react
  // across the room in a single frame.
  let snakeKnifePoisonSpreading = false;
  function spreadSnakeKnifePoison(enemy, state) {
    if (snakeKnifePoisonSpreading) return;
    if (!enemy || enemy.dead) return;
    if (Neo.nextRandom('encounter') >= 0.01) return;
    const radius = 150 * Number(Neo.getItemStats?.()?.aoeRadiusMultiplier || 1);
    let target = null;
    let bestDistSq = Infinity;
    const visitEnemy = other => {
      if (!other || other === enemy || other.dead) return;
      if (Neo.getStatusStacks(other, 'poison') > 0) return;
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radius * radius || distSq >= bestDistSq) return;
      bestDistSq = distSq;
      target = other;
    };
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(enemy.x, enemy.y, radius + 80, visitEnemy, { excludeEnemy: enemy });
    } else {
      Neo.enemies.forEach(visitEnemy);
    }
    if (!target) return;
    snakeKnifePoisonSpreading = true;
    const duration = Math.max(1.6, Number(state?.duration || 0) * 0.6);
    applyPoison(target, 1, duration);
    snakeKnifePoisonSpreading = false;
  }

  // Static arcs aggressively — chaining through packs is the whole point of an
  // electric build. Each tick it jumps a stack to the nearest foe that isn't yet
  // as charged as this one, scaled up by stack count so a heavily-shocked enemy
  // seeds the room fast. Guarded against re-entrancy like the poison spread.
  let staticSpreading = false;
  function spreadStatic(enemy, state) {
    if (staticSpreading) return;
    if (!enemy || enemy.dead) return;
    const stacks = Math.max(1, Number(state?.stacks || 1));
    // Base 25% per tick, +10% per stack, capped — reliable but not instant.
    if (Neo.nextRandom('encounter') >= Math.min(0.85, 0.25 + stacks * 0.1)) return;
    const radius = 170 * Number(Neo.getItemStats?.()?.aoeRadiusMultiplier || 1);
    let target = null;
    let bestDistSq = Infinity;
    const visitEnemy = other => {
      if (!other || other === enemy || other.dead) return;
      // Arc toward foes less charged than the source so it spreads outward
      // instead of ping-ponging between two already-shocked enemies.
      if (Neo.getStatusStacks(other, 'static') >= stacks) return;
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radius * radius || distSq >= bestDistSq) return;
      bestDistSq = distSq;
      target = other;
    };
    if (typeof Neo.forEachEnemyNearCircle === 'function') {
      Neo.forEachEnemyNearCircle(enemy.x, enemy.y, radius + 80, visitEnemy, { excludeEnemy: enemy });
    } else {
      Neo.enemies.forEach(visitEnemy);
    }
    if (!target) return;
    staticSpreading = true;
    const duration = Math.max(2, Number(state?.duration || 0) * 0.7);
    applyStatic(target, 1, duration);
    // Visual arc between the two enemies.
    Neo.spawnParticle({ x: (enemy.x + target.x) / 2, y: (enemy.y + target.y) / 2, life: 0.18, c: Neo.STATUS_STYLES.static.color });
    Neo.spawnParticle({ x: target.x, y: target.y, life: 0.2, ring: target.r + 8, c: Neo.STATUS_STYLES.static.color });
    staticSpreading = false;
  }

  function updateEnemyStatuses(enemy, dt) {
    if (enemy.bleedFlash > 0) enemy.bleedFlash = Math.max(0, enemy.bleedFlash - dt);
    const stats = Neo.getItemStats?.() || {};
    const bleedStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (tickEnemyStatus(enemy, 'bleed', dt, {
      interval: 0.5,
      damage: (stacks, cachedStats) => scaleBleedDamageAgainstEnemy(enemy, stacks, cachedStats),
      color: Neo.STATUS_STYLES.bleed.textColor,
      particleColor: Neo.STATUS_STYLES.bleed.color,
      stats,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    if (tickEnemyStatus(enemy, 'fire', dt, {
      interval: 0.45,
      damage: (stacks, cachedStats) => scaleDamageAgainstEnemy(enemy, 1.5 + stacks * 1.8, DEFAULT_DAMAGE_OPTIONS, cachedStats),
      color: Neo.STATUS_STYLES.fire.textColor,
      particleColor: Neo.STATUS_STYLES.fire.color,
      stats,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    if (tickEnemyStatus(enemy, 'poison', dt, {
      interval: 0.7,
      damage: stacks => Math.max(1, enemy.max * (0.008 * stacks)),
      color: Neo.STATUS_STYLES.poison.textColor,
      particleColor: Neo.STATUS_STYLES.poison.color,
      onTick: spreadSnakeKnifePoison,
      stats,
    })) return bleedStacks;
    if (enemy.dead) return bleedStacks;
    tickEnemyStatus(enemy, 'dark_drain', dt, {
      interval: 0.6,
      // % max HP, mirroring poison so it stays meaningful against high-HP enemies.
      // The siphon (healScale) rides on this same value, so healing scales with it.
      damage: stacks => Math.max(1, enemy.max * (0.006 * stacks)),
      color: Neo.STATUS_STYLES.dark_drain.textColor,
      particleColor: Neo.STATUS_STYLES.dark_drain.color,
      healScale: 0.35,
      stats,
    });
    if (enemy.dead) return bleedStacks;
    if (tickEnemyStatus(enemy, 'static', dt, {
      interval: 0.5,
      // % max HP per stack, in line with poison/dark_drain so it stays relevant
      // against tanky foes. The arc to neighbours rides on onTick.
      damage: stacks => Math.max(1, enemy.max * (0.007 * stacks)),
      color: Neo.STATUS_STYLES.static.textColor,
      particleColor: Neo.STATUS_STYLES.static.color,
      onTick: spreadStatic,
      stats,
    })) return bleedStacks;
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

  // Combine two headings as 2D vectors so opposing angles cancel instead of
  // averaging into a meaningless sideways value (the trap with raw angle math).
  function blendAngles(a, weightA, b, weightB) {
    const x = Math.cos(a) * weightA + Math.cos(b) * weightB;
    const y = Math.sin(a) * weightA + Math.sin(b) * weightB;
    if (Math.hypot(x, y) < 1e-4) return a;
    return Math.atan2(y, x);
  }

  function resolveCorpseFallbackDirection(enemy) {
    // Prefer the killing blow's direction; otherwise shove the body away from
    // the player (reads as "I killed it" for DoT/contact kills).
    let base;
    const hitIsRecent = Number.isFinite(enemy._lastHitAngle)
      && (performance.now() - Number(enemy._lastHitAt || 0)) < 600;
    if (hitIsRecent) {
      base = enemy._lastHitAngle;
    } else if (Neo.player) {
      base = Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x);
    } else {
      return Neo.rand(Math.PI * 2, 0, 'fx');
    }
    // Bias toward the enemy's own travel heading when it was actually moving,
    // so a charger keeps barreling forward and a fleeing foe pitches ahead.
    const moveSpeed = Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0));
    if (moveSpeed > 4) {
      const moveAngle = Math.atan2(Number(enemy.vy || 0), Number(enemy.vx || 0));
      base = blendAngles(base, 1, moveAngle, Neo.clamp(moveSpeed / 90, 0, 0.6));
    }
    // Small scatter so stacked deaths don't all fly in lockstep.
    return base + Neo.rand(0.35, -0.35, 'fx');
  }

  function spawnEnemyCorpse(enemy) {
    if (!enemy || enemy.type === 'boss_spawner') return;
    const speed = Math.min(150, Math.hypot(Number(enemy.vx || 0), Number(enemy.vy || 0)));
    // Ragdoll launch heading. The killing blow's residual velocity is the best
    // signal (it already bakes in the hit's knockback + direction). When that's
    // too weak to read — DoT/low-knockback kills leave the body nearly still —
    // fall back to the last hit angle, else the direction away from the player,
    // then nudge that by the enemy's own travel heading so a fleeing/charging
    // foe still tumbles believably. Pure random is the last resort.
    const direction = speed > 8
      ? Math.atan2(Number(enemy.vy || 0), Number(enemy.vx || 0))
      : resolveCorpseFallbackDirection(enemy);
    const boss = Neo.isBossType(enemy.type);
    const elite = !!enemy.elite;
    const launchScale = boss ? 1.45 : elite ? 1.22 : 1;
    const tumbleBias = elite ? 1.18 : 1;
    Neo.deadBodies.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(direction) * (42 + speed * 0.36) * launchScale,
      vy: Math.sin(direction) * (42 + speed * 0.36) * launchScale,
      r: enemy.r,
      spriteKey: Neo.getEnemySpriteKey(enemy),
      type: enemy.type,
      elite,
      age: 0,
      fallTime: boss ? Neo.CORPSE_FALL_TIME * 1.35 : Neo.CORPSE_FALL_TIME,
      fadeStart: boss ? Neo.CORPSE_FADE_START * 1.8 : Neo.CORPSE_FADE_START,
      life: boss ? Neo.CORPSE_LIFETIME * 1.9 : Neo.CORPSE_LIFETIME,
      angle: direction + Math.PI / 2,
      fallAngle: Neo.rand(0.95, -0.95, 'fx') + (enemy.elite ? 0.25 : 0),
      angularOffset: 0,
      angularV: Neo.rand(7.6, -7.6, 'fx') * tumbleBias,
      angularDrag: boss ? 1.6 : 2.3,
      z: 0,
      vz: (150 + speed * 0.4 + (boss ? 55 : elite ? 24 : 0)) * launchScale,
      gravity: boss ? 500 : 560,
      bounce: boss ? 0.36 : elite ? 0.3 : 0.24,
      slideDrag: boss ? 4.2 : 5.8,
      airDrag: boss ? 1.2 : 1.9,
      face: Neo.getFacingDirection(enemy, enemy.beamAngle || enemy.dashAngle || direction),
      size: Math.max(30, enemy.r * 2.4),
      bloodColor: enemy.type === 'god' ? '#f2ecff' : enemy.elite ? '#c04a14' : '#8d0018',
    });
  }

  function dropFinalRivalRelic(enemy) {
    const blueKeys = Object.keys(Neo.ITEM_DEFS || {}).filter(
      key => String(Neo.ITEM_DEFS[key]?.rarity || '').toLowerCase() === 'blue',
    );
    if (blueKeys.length === 0) return '';
    const key = blueKeys[Math.floor(Neo.nextRandom('loot') * blueKeys.length)];
    Neo.pickups.push({ x: enemy.x, y: enemy.y - 8, type: 'item', key });
    return key;
  }

  function onEnemyDie(enemy, options = {}) {
    if (enemy.type === 'god' && !enemy.rebirthUsed && !options.forceDeath) {
      enemy.rebirthUsed = true;
      enemy.hp = Math.max(1, Math.round(enemy.max * 0.9));
      enemy.dmg = Math.round(enemy.dmg * 3);
      enemy.speed *= 1.18;
      Neo.triggerGodPhase(enemy, 2, 'DIVINE REBIRTH');
      Neo.playGodDialogue(2);
      Neo.spawnHealPopup(enemy.x, enemy.y - 54, enemy.hp, { color: '#79f7bf' });
      return;
    }
    // The Cult Queen cheats death once: instead of dying she channels a final
    // desperation AOE (see updateCultQueenBoss), then detonates and dies for real.
    if (enemy.type === 'queen_cult' && !enemy.queenFinisherDone && !enemy.queenFinisherActive && !options.forceDeath) {
      enemy.queenFinisherActive = true;
      enemy.queenFinisherTimer = Neo.QUEEN_FINISHER_WINDUP;
      enemy.hp = 1;
      // updateCultQueenBoss takes over from here: it clears `inv`, applies the
      // +400 finisher resistance, and clamps her hp to >=1 each tick so the
      // player can chip but not interrupt the windup.
      Neo.sayOverEntity?.(enemy, 'Then burn with me!', { holdTime: 1.6 });
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 12, life: 0.6, text: 'CHARGING', c: '#ff6ad5' });
      return;
    }
    if (enemy.dead) return;
    enemy.dead = true;

    // Kill punch: shake without hitstop so enemy deaths do not read as frame drops.
    const killWeight = enemy.type === 'god' || enemy.boss ? 1 : enemy.elite ? 0.55 : 0.2;
    Neo.addTrauma?.(0.22 + killWeight * 0.45);
    enemy._dmgPopup = null; // close out any combo-merge target

    const index = Neo.enemies.indexOf(enemy);
    if (index >= 0) Neo.enemies.splice(index, 1);
    Neo.minimapLegendDirty = true;
    const isTutorialDummy = !!enemy.tutorialDummy;
    spawnEnemyCorpse(enemy);
    const itemStats = Neo.getItemStats();
    const deathBleedStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (itemStats.bleedSplashStacks > 0 && deathBleedStacks > 0) {
      const splashRadius = 92 + Math.min(70, deathBleedStacks * 8);
      Neo.applyStatusInRadius(enemy.x, enemy.y, splashRadius, 'bleed', itemStats.bleedSplashStacks, 4.5, enemy);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y, life: 0.36, ring: splashRadius, c: '#ff4f6d' });
    }
    if (Neo.player) Neo.player.kills = Math.max(0, Number(Neo.player.kills || 0)) + 1;
    window.achievementEvents?.emit('enemy:killed');
    // Moggy's Coat: a kill made while hidden primes the coat. The next combat
    // opens with Dark Drain on every enemy (see enterRoom's combat-start hook).
    if (!isTutorialDummy && Neo.player && !Neo.player.moggysCoatPrimed
        && (Neo.getItemCount?.('moggys_coat') || 0) > 0 && Neo.isPlayerHidden?.()) {
      Neo.player.moggysCoatPrimed = true;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - Neo.player.r - 20, life: 0.8, text: 'COAT PRIMED', c: '#5a78d6' });
    }
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
      const graveX = enemy.x;
      const graveY = enemy.y;
      const graveRadius = 118;
      Neo.hazards.push({
        kind: 'grave_zone',
        x: graveX,
        y: graveY,
        r: graveRadius,
        ttl: 2,
        pushPower: 340 * moveSpeed,
        moveSpeed,
        source: 'grave_zone',
      });
      Neo.spawnParticle({ x: graveX, y: graveY, life: 0.45, ring: graveRadius, c: '#c9b3ff' });

      // Small burst of damage to everything caught in the field, with 20% of the
      // damage dealt drained back to the player as healing.
      const graveDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 0.4));
      let graveDamageDealt = 0;
      for (let gi = Neo.enemies.length - 1; gi >= 0; gi -= 1) {
        const other = Neo.enemies[gi];
        if (!other || other === enemy) continue;
        if (!isWithinRadiusSq(graveX, graveY, other, graveRadius, other.r)) continue;
        const before = Number(other.hp || 0);
        const angle = Math.atan2(other.y - graveY, other.x - graveX);
        hitEnemy(other, graveDamage, angle, 120, '#c9b3ff');
        graveDamageDealt += Math.max(0, before - Number(other.hp || 0));
        // 2% chance to briefly freeze (hard stun) anything caught in the grave.
        if (Neo.nextRandom('encounter') < 0.02) {
          other.stun = Math.max(Number(other.stun || 0), 0.6);
          Neo.applyStatus(other, 'slow', 1, 4);
          Neo.spawnParticle({ x: other.x, y: other.y - other.r - 18, life: 0.5, text: 'FROZEN', c: '#9fe8ff' });
        }
      }
      if (graveDamageDealt > 0 && Neo.player && Neo.player.hp < Neo.player.maxHp) {
        const heal = Neo.applyPlayerHealing(Neo.scalePlayerHealing(graveDamageDealt * 0.2, 1));
        if (heal > 0) {
          Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, heal, { color: '#c9b3ff', size: 13 });
        }
      }

      // Crimson-Smash-style rock debris hurled outward from the grave.
      const graveRockCount = 6;
      const graveRockDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 0.3));
      for (let ri = 0; ri < graveRockCount; ri += 1) {
        const rockAngle = (ri / graveRockCount) * Math.PI * 2 + Neo.nextRandom('fx') * 0.3;
        const rockSpeed = 420 + Neo.nextRandom('fx') * 120;
        Neo.spawnProjectile({
          x: graveX + Math.cos(rockAngle) * (graveRadius * 0.3),
          y: graveY + Math.sin(rockAngle) * (graveRadius * 0.3),
          vx: Math.cos(rockAngle) * rockSpeed,
          vy: Math.sin(rockAngle) * rockSpeed,
          r: 7,
          life: 0.6,
          enemy: false,
          kind: 'rock',
          damage: graveRockDamage,
          knockback: 180,
          color: '#c9b3ff',
          pierceCount: 1,
        });
      }
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

    const eliteItemDropChance = Neo.getRandomItemDropChance(0.18, 0.65);
    const normalItemDropChance = Neo.getRandomItemDropChance(0, 0.35);
    if (!isTutorialDummy && enemy.type !== 'rival' && enemy.elite && enemyLootRandom() < eliteItemDropChance) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemy.type !== 'rival' && !enemy.elite && normalItemDropChance > 0 && enemyLootRandom() < normalItemDropChance) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemyLootRandom() < 0.1) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    }

    if (!isTutorialDummy && Neo.gameMode !== 'practice' && Neo.isBossType(enemy.type)) {
      const crystalStacks = Math.max(0, Neo.getItemCount('rich_mans_blues'));
      if (crystalStacks > 0) {
        Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + crystalStacks;
        Neo.runCrystalsEarned = Number(Neo.runCrystalsEarned || 0) + crystalStacks;
        Neo.spawnParticle({
          x: enemy.x,
          y: enemy.y - enemy.r - 28,
          life: 0.9,
          text: `+${crystalStacks} LOOP CRYSTAL${crystalStacks === 1 ? '' : 'S'}`,
          c: '#58b7ff',
        });
        Neo.persistMetaSoon();
      }
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
      if (!Neo.metaProgress.unlockedCharacters.includes('gelleh')) Neo.metaProgress.unlockedCharacters.push('gelleh');
      if (Neo.gameMode === 'boss_rush') {
        Neo.currentRoom.cleared = true;
        Neo.bossRushActive = false;
        Neo.onBossRushBossDefeated();
        return;
      }
      if (Neo.currentRoom?.type === 'god') {
        const survivingBosses = Neo.enemies.filter(other => other && Neo.isBossType(other.type));
        survivingBosses.forEach(other => {
          other.hp = 0;
          other.rebirthUsed = true;
          other.queenFinisherDone = true;
          other.queenFinisherActive = false;
          other.splitReady = false;
          onEnemyDie(other, { forceDeath: true, suppressRoomClear: true });
        });
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
        if (Neo.gameMode === 'boss_rush') left.bossRushStage = Neo.bossRushStage;
        left.hp = Math.round(left.max * 1.6);
        left.max = left.hp;
        left.dmg = Math.round(left.dmg * 1.35);
      }
      if (rightSpawn) {
        const right = Neo.spawnEnemy('golem', rightSpawn.x, rightSpawn.y, true);
        right.spawnedFromBulk = true;
        if (Neo.gameMode === 'boss_rush') right.bossRushStage = Neo.bossRushStage;
        right.hp = Math.round(right.max * 1.6);
        right.max = right.hp;
        right.dmg = Math.round(right.dmg * 1.35);
      }


    }

    if (enemy.type === 'mirror_knight' && Neo.currentRoom?.type === 'challenge') {
      Neo.completeChallengeTrial('MIRROR BROKEN');
    }

    if (enemy.type === 'bowman_bane' && Neo.currentRoom?.secret && Neo.currentRoom?.secretKind === 'bowman_bane') {
      window.achievementEvents?.emit('bowman:killed');
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
        rival.lives = Math.max(0, Number(rival.lives ?? 2) - 1);
        // Killing them sours the relationship; a grudge (negative) means they
        // come back armed with five god items and a vendetta (see spawnRivals).
        rival.relationship = Number(rival.relationship || 0) - 5;
        if (Neo.player) Neo.player.rivalReputation = Math.max(0, Number(Neo.player.rivalReputation || 0)) + 1;
        window.achievementEvents?.emit('rival:killed');
        // Every rival death arms the survivors: each living rival (including
        // ones waiting on a return floor) pockets 10 random items.
        (Neo.rivals || []).forEach(other => {
          if (other !== rival && !other.dead) Neo.grantRivalItems?.(other, 10);
        });
        (Neo.pendingRivalReturns || []).forEach(entry => {
          if (entry?.rival) Neo.grantRivalItems?.(entry.rival, 10, { allowDead: true });
        });
        // Mooggy's death curse: 15 blood thorn traps seeded on the next floor
        // (20 if she instead survives the descent — see spawnRivals).
        if (rival.characterKey === 'mooggy') {
          Neo.pendingMooggyTraps = Math.max(Number(Neo.pendingMooggyTraps || 0), 15);
        }
        const stolenLoot = Array.isArray(rival.loot) ? rival.loot : [];
        const finalDeath = rival.lives <= 0;
        if (finalDeath) {
          // The large item windfall belongs to the surviving rivals. A final
          // kill gives the player one relic instead of spilling the full pack.
          dropFinalRivalRelic(enemy);
          if (!Array.isArray(Neo.slainRivalKeys)) Neo.slainRivalKeys = [];
          if (!Neo.slainRivalKeys.includes(rival.characterKey)) Neo.slainRivalKeys.push(rival.characterKey);
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - 44, life: 2.2, text: 'SLAIN FOR GOOD', c: '#9fd0ff' });
        } else {
          // Extra life spent: they escape with their pack and return on a
          // later floor (with god gear if the relationship went negative).
          Neo.pendingRivalReturns = Array.isArray(Neo.pendingRivalReturns) ? Neo.pendingRivalReturns : [];
          Neo.pendingRivalReturns.push({
            returnFloor: Neo.floor + 1,
            rival: { ...rival, dead: false, hp: rival.max, hpSnapshot: rival.max },
          });
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - 44, life: 2.2, text: `${rival.name.toUpperCase()} WILL RETURN...`, c: rival.color });
        }
        const rivalBase = 18 + Neo.floor * 4 + (finalDeath ? stolenLoot.length * 8 : 0);
        const bonus = Neo.hasLegacy('rival_bounty') ? Math.round(rivalBase * 1.5) : rivalBase;
        dropCoins(enemy.x, enemy.y, bonus);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 26, life: 2.0, text: `${rival.name.toUpperCase()} DEFEATED!`, c: rival.color });
        Neo.sayAtPosition(enemy.x, enemy.y, rival.deathLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
        grantXp(20 + Neo.floor * 3);
      }
      // Note: the enemy is already removed from Neo.enemies and player.kills is
      // already incremented in the shared death handler above (see the splice +
      // kills bump near enemy.dead = true). Don't repeat them here or rivals
      // count as two kills.
    }
    if (enemy.type === 'rival') return;

    if (!options.suppressRoomClear && !Neo.enemies.some(e => e.type !== 'rival') && !Neo.currentRoom.cleared) {
      if (Neo.currentRoom.type === 'challenge') {
        Neo.updateObjective();
        return;
      }
      Neo.currentRoom.cleared = true;
      if (Neo.currentRoom.type === 'boss' && Neo.gameMode === 'treasure_hunt') {
        Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'treasureKey' });
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 42, life: 1.3, text: 'VAULT KEY DROPPED', c: '#ffd966' });
      } else if (Neo.currentRoom.type === 'boss' && Neo.gameMode !== 'endless' && Neo.gameMode !== 'boss_rush') {
        spawnBossRewardChoices(enemy);
      }
      if (Neo.gameMode === 'treasure_hunt' && Neo.currentRoom.treasureHuntEscapeActive) {
        Neo.currentRoom.treasureHuntEscapeActive = false;
        if (!Neo.currentRoom.treasureHuntRewardSpawned) {
          Neo.currentRoom.treasureHuntRewardSpawned = true;
          const rewardRandom = Neo.createRoomRandom(Neo.currentRoom, 'treasure-hunt:escape-reward');
          dropCoins(enemy.x, enemy.y, 18 + Neo.floor * 4);
          if (rewardRandom() < 0.38) {
            Neo.pickups.push({ x: enemy.x + 28, y: enemy.y, type: 'item', key: rollItemDrop({ random: rewardRandom }) });
          } else if (rewardRandom() < 0.65) {
            Neo.pickups.push({ x: enemy.x + 28, y: enemy.y, type: 'potion' });
          }
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - 34, life: 0.9, text: 'ESCAPE LOOT', c: '#ffd966' });
        }
      }
      if ((Neo.currentRoom.type === 'ladder' || Neo.currentRoom.type === 'boss')
        && Neo.gameMode !== 'endless'
        && Neo.gameMode !== 'boss_rush'
        && Neo.gameMode !== 'treasure_hunt') {
        Neo.pickups.push({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2, type: 'ladder' });
      }
      if (Neo.gameMode === 'endless' && Neo.endlessWaveActive) {
        Neo.endlessWaveActive = false;
        onEndlessWaveCleared();
      }
      if (Neo.gameMode === 'boss_rush' && Neo.bossRushActive && enemy.bossRushStage === Neo.bossRushStage) {
        Neo.bossRushActive = false;
        Neo.onBossRushBossDefeated();
      }
      Neo.updateObjective();
      Neo.scheduleRunSave();
    }
  }

  function spawnBossRewardChoices(enemy = null) {
    const room = Neo.currentRoom;
    if (!room || room.bossRewardSpawned) return;
    room.bossRewardSpawned = true;
    const rewardRandom = Neo.createRoomRandom(room, 'boss:reward-five');
    const choices = Array.isArray(room.bossRewardChoices) && room.bossRewardChoices.length >= 5
      ? room.bossRewardChoices.slice(0, 5)
      : Neo.createSeededItemChoices?.(5, rewardRandom, { elite: true }) || [];
    room.bossRewardChoices = choices;
    const picksRemaining = Neo.getBossRewardPickCount?.(Neo.floor, room) || 1;
    const groupId = room.bossRewardGroupId || `boss:${room.gx ?? 0}:${room.gy ?? 0}:${Neo.floor}`;
    room.bossRewardGroupId = groupId;
    const cx = Neo.ROOM_W / 2;
    const cy = Neo.ROOM_H / 2 + 68;
    const offsets = [-144, -72, 0, 72, 144];
    choices.forEach((key, index) => {
      Neo.pickups.push({
        x: cx + offsets[index],
        y: cy,
        type: 'rewardChoice',
        key,
        groupId,
        picksRemaining,
        label: `${picksRemaining}/5`,
      });
    });
    const announceX = enemy?.x || cx;
    const announceY = enemy?.y || cy;
    Neo.spawnParticle({ x: announceX, y: announceY - 42, life: 1.2, text: `PICK ${picksRemaining} OF 5`, c: '#d7f6ff' });
  }

  function onEndlessWaveCleared() {
    Neo.endlessWave += 1;
    Neo.updateEndlessWaveHud?.();
    window.achievementEvents?.emit('endless:wave', { wave: Neo.endlessWave });
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
    // Arm a frame-driven countdown instead of a bare setTimeout. The timer is
    // serialized with the run (see serializeRun) and ticked in update.js, so a
    // reload during the intermission resumes correctly instead of stranding the
    // player in an empty cleared room with no next wave.
    const delay = Neo.endlessWave <= 2 ? 4 : Neo.endlessWave <= 5 ? 3 : 2;
    Neo.endlessRespawnTimer = delay;
    Neo.scheduleRunSave?.();
  }

  // Spawns the next endless wave once the intermission countdown elapses. Called
  // from the update loop (and on restore when the saved timer has run out).
  function spawnNextEndlessWave() {
    Neo.endlessRespawnTimer = 0;
    if (Neo.gameMode !== 'endless' || Neo.gameState !== 'play' || !Neo.currentRoom) return;
    Neo.currentRoom.cleared = false;
    Neo.endlessWaveActive = true;
    Neo.updateEndlessWaveHud?.();
    const nextWave = Neo.endlessWave + 1;
    const waveSize = Math.min(4 + Neo.endlessWave + Math.floor(Neo.endlessWave / 3), 18);
    Neo.spawnEndlessWave(nextWave, waveSize);
    Neo.spawnParticle({ x: Neo.ROOM_W / 2, y: Neo.ROOM_H / 2 - 40, life: 1.1, text: `WAVE ${nextWave}`, c: '#ff8b8b' });
    Neo.scheduleRunSave?.();
  }

  function dropCoins(x, y, amount) {
    const modeMultiplier = Neo.gameMode === 'treasure_hunt' ? 3 : 1;
    const scaledAmount = Math.max(1, Math.round(Number(amount || 0) * Neo.getRunDifficultyScalars().coinRewardMultiplier * modeMultiplier));
    let remaining = scaledAmount;
    while (remaining > 0) {
      const roll = Neo.nextRandom ? Neo.nextRandom('loot') : Neo.rng();
      let value = 1;
      if (remaining >= 15 && roll < 0.05) {
        value = 15;
      } else if (remaining >= 10 && roll < 0.12) {
        value = 10;
      } else if (remaining >= 5 && roll < 0.28) {
        value = 5;
      }
      const spread = value >= 15 ? 26 : value >= 10 ? 22 : value >= 5 ? 18 : 14;
      Neo.pickups.push({
        x: x + Neo.rand(-spread, spread, 'loot'),
        y: y + Neo.rand(-spread, spread, 'loot'),
        type: 'coin',
        value,
      });
      remaining -= value;
    }
    Neo.minimapLegendDirty = true;
  }

  function rollItemDrop(options = {}) {
    const adjustEntriesForScrollControl = (entries) => {
      if (!Neo.player) return entries;
      const storedWeightItems = Array.isArray(Neo.player.scrollPoolWeights) ? Neo.player.scrollPoolWeights : [];
      const activeWeightItems = storedWeightItems
        .filter(buff => buff && Number(buff.expiresFloor || 0) >= Neo.floor && Neo.ITEM_DEFS?.[buff.itemKey]);
      if (activeWeightItems.length !== storedWeightItems.length) {
        Neo.player.scrollPoolWeights = activeWeightItems;
        Neo.scheduleRunSave?.();
      }
      const egoActive = Number(Neo.player.scrollEgoFloor || 0) === Neo.floor;
      if (!activeWeightItems.length && !egoActive) return entries;
      const owned = Neo.player.items || {};
      return entries.map(([key, weight]) => {
        const item = Neo.ITEM_DEFS?.[key];
        let nextWeight = Number(weight || 0);
        if (egoActive && Number(owned[key] || 0) > 0) nextWeight *= 1.1;
        if (activeWeightItems.length) {
          activeWeightItems.forEach(buff => {
            if (buff.itemKey !== key) return;
            const rarity = String(item?.rarity || 'knight').toLowerCase();
            const boost = rarity === 'god' || rarity === 'red'
              ? 1.2
              : rarity === 'wizard' || rarity === 'purple'
                ? 1.3
                : 1.5;
            nextWeight *= boost;
          });
        }
        return [key, nextWeight];
      });
    };
    const applyScrollReplacement = (key) => {
      if (!Neo.player || !key) return key;
      const replaceMap = Neo.player.scrollReplaceMap || {};
      const rarity = String(Neo.ITEM_DEFS?.[key]?.rarity || 'knight').toLowerCase();
      const replacementKey = replaceMap[key];
      const replacementRarity = String(Neo.ITEM_DEFS?.[replacementKey]?.rarity || '').toLowerCase();
      if (replacementKey && replacementRarity === rarity) return replacementKey;
      const branching = Neo.player.scrollBranchingTargets || {};
      const branchingKey = branching[rarity];
      const branchingRarity = String(Neo.ITEM_DEFS?.[branchingKey]?.rarity || '').toLowerCase();
      if (branchingKey && branchingRarity === rarity) {
        const nextKey = branching[rarity];
        delete branching[rarity];
        Neo.player.scrollBranchingTargets = branching;
        Neo.scheduleRunSave?.();
        return nextKey;
      }
      return key;
    };
    const sandbox = Neo.getActiveSandboxSettings();
    if (sandbox) {
      const baseEntries = options.elite
        ? Neo.ITEM_DROP_WEIGHTS.map(([key, weight]) => [
            key,
            weight + (key !== 'neo_knife' && (!key.startsWith('voucher_') || key === 'voucher_white') ? 4 : 0),
          ])
        : Neo.ITEM_DROP_WEIGHTS;
      const filteredEntries = baseEntries.filter(([key]) => sandbox.allowedItems.includes(key));
      if (filteredEntries.length > 0) {
        const rolled = Neo.rollFromWeightTable(Neo.buildWeightTable(adjustEntriesForScrollControl(filteredEntries)), options.stream || 'loot', options.random);
        return applyScrollReplacement(rolled);
      }
    }
    const entries = options.elite
      ? Neo.ITEM_DROP_WEIGHTS.map(([key, weight]) => [
          key,
          weight + (key !== 'neo_knife' && (!key.startsWith('voucher_') || key === 'voucher_white') ? 4 : 0),
        ])
      : Neo.ITEM_DROP_WEIGHTS;
    const rolled = Neo.rollFromWeightTable(Neo.buildWeightTable(adjustEntriesForScrollControl(entries)), options.stream || 'loot', options.random);
    return applyScrollReplacement(rolled);
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
    const gains = Neo.getArtificerLevelGains(Neo.getItemCount('artificer_charger'));
    Neo.player.maxHp += gains.maxHp;
    Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + gains.maxHp);
    Neo.player.attackPower += gains.attackPower;
    Neo.player.attackSpeed += gains.attackSpeed;
    Neo.markInventoryPanelDirty();
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.9, text: `LV ${Neo.player.level}`, c: '#7dff9e' });
  }

  function applyArtificerChargerPickup(previousCount, collectCount) {
    if (!Neo.player || previousCount + collectCount <= 0) return;
    if (previousCount > 0) {
      // A duplicate charger burns 1 Loop Crystal to contain the overcharge.
      // Only a player with an empty crystal balance dies from it.
      const crystals = Math.max(0, Math.floor(Number(Neo.metaProgress?.loopCrystals || 0)));
      if (crystals > 0) {
        Neo.metaProgress.loopCrystals = crystals - 1;
        Neo.persistMetaSoon();
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.2, text: 'OVERCHARGE CONTAINED: -1 LOOP CRYSTAL', c: '#58b7ff' });
        return;
      }
      Neo.lastDamageSource = 'Artificer Charger';
      Neo.lastDamageSourceKey = 'artificer_charger';
      Neo.player.hp = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1, text: 'OVERCHARGED', c: '#fff3ae' });
      setTimeout(() => Neo.die(), 0);
      return;
    }

    const levelsGained = Math.max(1, Math.floor(Number(Neo.player.level) || 1));
    const gains = Neo.getArtificerLevelGains(1);
    for (let index = 0; index < levelsGained; index += 1) {
      Neo.player.xpToNext = Math.round(Neo.player.xpToNext * 1.22);
    }
    Neo.player.level += levelsGained;
    Neo.player.maxHp += gains.maxHp * levelsGained;
    Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + gains.maxHp * levelsGained);
    Neo.player.attackPower += gains.attackPower * levelsGained;
    Neo.player.attackSpeed += gains.attackSpeed * levelsGained;
    window.achievementEvents?.emit('player:leveled', { level: Neo.player.level });
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 1.2, text: `LEVEL DOUBLED: ${Neo.player.level}`, c: '#69c8ff' });
  }

  function grantRichMansBluesPickupCrystals(collectCount) {
    if (!Neo.player || collectCount <= 0 || Neo.gameMode === 'practice') return;
    const gained = Neo.getRichMansBluesCrystalReward(
      Neo.floorsEntered ?? Neo.floor,
      collectCount,
    );
    Neo.metaProgress.loopCrystals = Number(Neo.metaProgress.loopCrystals || 0) + gained;
    Neo.runCrystalsEarned = Number(Neo.runCrystalsEarned || 0) + gained;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 1.1, text: `+${gained} LOOP CRYSTALS`, c: '#58b7ff' });
    Neo.persistMetaSoon();
  }

  function readyRobotArmOnFirstPickup(itemKey, previousCount) {
    if (itemKey !== 'robot_arm' || previousCount > 0 || !Neo.player) return;
    Neo.player.robotArmReady = true;
    Neo.player.robotArmChargeKills = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'ARM READY', c: '#a9e6ff' });
  }

  function canDuplicateItemPickup(itemKey) {
    return itemKey !== 'artificer_charger';
  }

  function collectItem(itemKey) {
    if (Neo.isChallengeActive('no_items')) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 0.85, text: 'NO ITEMS', c: '#ff8a98' });
      return;
    }
    const item = Neo.itemRegistry.get(itemKey);
    if (!item) return;
    const duplicateChance = Neo.clamp(Number(Neo.getItemStats?.()?.itemDuplicateChance || 0), 0, 1);
    const duplicatePickup = canDuplicateItemPickup(itemKey) && duplicateChance > 0 && Neo.rng() < duplicateChance;
    const collectCount = duplicatePickup ? 2 : 1;
    const previousCount = Neo.getItemCount(itemKey);
    Neo.player.items[itemKey] = previousCount + collectCount;
    readyRobotArmOnFirstPickup(itemKey, previousCount);
    if (itemKey === 'artificer_charger') applyArtificerChargerPickup(previousCount, collectCount);
    if (itemKey === 'rich_mans_blues') grantRichMansBluesPickupCrystals(collectCount);
    if (Neo.isFirstRunTutorialActive()) Neo.tutorialState.gotRelic = true;
    Neo.addToEquipmentSlots?.(itemKey);
    Neo.markInventoryPanelDirty();
    if ((Neo.VOUCHER_KEYS || []).includes(itemKey)) Neo.refreshShopVoucherBanner?.();
    Neo.pushItemNotification(itemKey, collectCount);
    if (duplicatePickup) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 42, life: 0.85, text: 'ITEM DOUBLED', c: '#d8c0ff' });
    }
    const totalItems = Object.values(Neo.player.items).reduce((s, v) => s + Number(v || 0), 0);
    window.achievementEvents?.emit('item:collected', { totalItems });

    if (itemKey === 'jesters_dice') {
      Neo.floorSkipPending += 3 * collectCount;
      const bonusItemCounts = {};
      for (let index = 0; index < 10 * collectCount; index += 1) {
        const rewardPool = Neo.ITEM_KEYS.filter(key => (
          key !== 'jesters_dice' && Neo.ITEM_DEFS[key]?.rarity !== 'blue'
        ));
        const key = rewardPool[Neo.irand(0, rewardPool.length - 1, 'loot')];
        const previousBonusCount = Neo.getItemCount(key);
        Neo.player.items[key] = previousBonusCount + 1;
        readyRobotArmOnFirstPickup(key, previousBonusCount);
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
      for (let index = 0; index < collectCount; index += 1) Neo.openWizardPawSelection();
    } else if (itemKey === 'extra_battery') {
      for (let index = 0; index < collectCount; index += 1) Neo.openExtraBatterySelection();
    } else if (Neo.isScrollControlItem?.(itemKey)) {
      // Scrolls resolve their selection popup on acquisition (pickup/buy/reward),
      // not as an activatable tool. Queue one prompt per copy collected.
      Neo.enqueueScrollSelection?.(itemKey, collectCount);
    }

    if (itemKey === 'titan_heart') {
      for (let index = 0; index < collectCount; index += 1) {
        Neo.player.maxHp = Math.max(120, Math.round(Neo.player.maxHp * 1.08));
        Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Neo.player.hp * 1.08));
      }
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
  Neo.isChargedWeaponKey = isChargedWeaponKey;
  Neo.getWeaponMaxCharges = getWeaponMaxCharges;
  Neo.ensureWeaponChargeState = ensureWeaponChargeState;
  Neo.getWeaponCooldownInfo = getWeaponCooldownInfo;
  Neo.spawnWeaponProjectile = spawnWeaponProjectile;
  Neo.fireWeaponSweep = fireWeaponSweep;
  Neo.tryWeaponAttack = tryWeaponAttack;
  Neo.tryMelee = tryMelee;
  Neo.fireLazerGlassesTick = fireLazerGlassesTick;
  Neo.updateWeaponSystems = updateWeaponSystems;
  Neo.tryLaser = tryLaser;
  Neo.isInstantLaserMove = isInstantLaserMove;
  Neo.isMooggySwipeActive = isMooggySwipeActive;
  Neo.releaseMooggySwipe = releaseMooggySwipe;
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
  Neo.spawnChaosBlast = spawnChaosBlast;
  Neo.castBladeOfJustice = castBladeOfJustice;
  Neo.updateJusticeBlades = updateJusticeBlades;
  Neo.updateSkySwords = updateSkySwords;
  Neo.castSmiteChain = castSmiteChain;
  Neo.findNearestSmiteTarget = findNearestSmiteTarget;
  Neo.castHealingZone = castHealingZone;
  Neo.updateHealingZoneCharge = updateHealingZoneCharge;
  Neo.HEALING_ZONE_MAX_CHARGE = HEALING_ZONE_MAX_CHARGE;
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
  Neo.procyPickleSpread = procyPickleSpread;
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
  Neo.dropFinalRivalRelic = dropFinalRivalRelic;
  Neo.onEnemyDie = onEnemyDie;
  Neo.onEndlessWaveCleared = onEndlessWaveCleared;
  Neo.spawnNextEndlessWave = spawnNextEndlessWave;
  Neo.dropCoins = dropCoins;
  Neo.rollItemDrop = rollItemDrop;
  Neo.grantXp = grantXp;
  Neo.levelUp = levelUp;
  Neo.collectItem = collectItem;
  Neo.updateItemUI = updateItemUI;
