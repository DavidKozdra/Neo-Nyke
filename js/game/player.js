// player.js — Player data migration, stats, abilities, charge.
export function migratePlayerData(source) {
    const playerData = source || Neo.createDefaultPlayer();
    playerData.character = playerData.character || 'thorn_knight';
    if (!playerData.items) {
      const legacy = playerData.relics || {};
      playerData.items = {
        neo_knife: legacy.thorn ? 1 : 0,
        orb_of_blood: legacy.hemo ? 1 : 0,
        hemes_scarf: legacy.leech ? 1 : 0,
      };
    }
    delete playerData.relics;
    if (playerData.items && typeof playerData.items === 'object' && Number(playerData.items.scholors_cap || 0) > 0) {
      playerData.items.scholar_cap = Number(playerData.items.scholar_cap || 0) + Number(playerData.items.scholors_cap || 0);
      delete playerData.items.scholors_cap;
    }
    Neo.ITEM_KEYS.forEach(key => {
      playerData.items[key] = Number(playerData.items[key] || 0);
    });
    if (!playerData.moveStackOverrides || typeof playerData.moveStackOverrides !== 'object') {
      playerData.moveStackOverrides = {};
    }
    const normalizedMoveStackOverrides = {};
    Object.entries(playerData.moveStackOverrides).forEach(([moveKey, value]) => {
      if (!Neo.MOVE_DEFS[moveKey]) return;
      const nextValue = Math.max(1, Math.floor(Number(value || 0)));
      normalizedMoveStackOverrides[moveKey] = nextValue;
    });
    playerData.moveStackOverrides = normalizedMoveStackOverrides;
    playerData.extraBatteryPendingCount = Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0)));
    playerData.wizardPawPendingCount = Math.max(0, Math.floor(Number(playerData.wizardPawPendingCount || 0)));
    playerData.level = Number(playerData.level || 1);
    playerData.xp = Number(playerData.xp || 0);
    playerData.xpToNext = Number(playerData.xpToNext || 20);
    playerData.attackPower = Number(playerData.attackPower || 0);
    playerData.attackSpeed = Number(playerData.attackSpeed || 1);
    playerData.roomDamageTaken = Number(playerData.roomDamageTaken || 0);
    playerData.rivalReputation = Number(playerData.rivalReputation || 0);
    playerData.veggysRoomCounter = Number(playerData.veggysRoomCounter || 0);
    playerData.stun = Math.max(0, Number(playerData.stun || 0));
    playerData.dashTime = Number(playerData.dashTime || 0);
    playerData.dashX = Number(playerData.dashX || 0);
    playerData.dashY = Number(playerData.dashY || 0);
    playerData.cowardsWayTime = Number(playerData.cowardsWayTime || 0);
    playerData.warpHideTime = Number(playerData.warpHideTime || 0);
    playerData.mooggyZoomiesTime = Number(playerData.mooggyZoomiesTime || 0);
    playerData.lavaWalkTime = Number(playerData.lavaWalkTime || 0);
    playerData.lavaTrailTick = Number(playerData.lavaTrailTick || 0);
    playerData.princessFlightTime = Number(playerData.princessFlightTime || 0);
    playerData.overhealBarrier = Math.max(0, Number(playerData.overhealBarrier || 0));
    playerData.graniallaHealPulseFrame = Number(playerData.graniallaHealPulseFrame || 0);
    Neo.ensureStatuses(playerData);
    if (!playerData.equippedMoves || typeof playerData.equippedMoves !== 'object') {
      playerData.equippedMoves = getDefaultMovesForCharacter(playerData.character);
    }
    if (!playerData.ownedMoves || typeof playerData.ownedMoves !== 'object') {
      playerData.ownedMoves = {};
    }
    if (!playerData.ownedWeapons || typeof playerData.ownedWeapons !== 'object') {
      playerData.ownedWeapons = {};
    }
    Neo.WEAPON_KEYS.forEach(key => {
      playerData.ownedWeapons[key] = !!playerData.ownedWeapons[key];
    });
    if (!Neo.WEAPON_DEFS[playerData.equippedWeapon]) playerData.equippedWeapon = '';
    const hasOwnedWeapons = Neo.WEAPON_KEYS.some(key => !!playerData.ownedWeapons[key]);
    if (!hasOwnedWeapons && !playerData.equippedWeapon) {
      const defaultWeapon = getDefaultWeaponForCharacter(playerData.character);
      if (defaultWeapon) {
        playerData.ownedWeapons[defaultWeapon] = true;
        playerData.equippedWeapon = defaultWeapon;
      }
    }
    if (playerData.equippedWeapon) playerData.ownedWeapons[playerData.equippedWeapon] = true;
    playerData.weaponCooldown = Number(playerData.weaponCooldown || 0);
    playerData.blockActive = !!playerData.blockActive;
    playerData.blockTimer = Number(playerData.blockTimer || 0);
    playerData.fleeceTick = Number(playerData.fleeceTick || 0);
    playerData.weaponBeamTime = Number(playerData.weaponBeamTime || 0);
    playerData.weaponBeamTick = Number(playerData.weaponBeamTick || 0);
    if (!Array.isArray(playerData.equipmentSlots)) playerData.equipmentSlots = [];
    if (!playerData.equipmentCooldowns || typeof playerData.equipmentCooldowns !== 'object') playerData.equipmentCooldowns = {};
    if (!playerData.equipmentEffects || typeof playerData.equipmentEffects !== 'object') playerData.equipmentEffects = {};
    if (!playerData.anvilUpgrades || typeof playerData.anvilUpgrades !== 'object') {
      playerData.anvilUpgrades = { weapon: {}, move: {} };
    }
    if (!playerData.anvilUpgrades.weapon || typeof playerData.anvilUpgrades.weapon !== 'object') playerData.anvilUpgrades.weapon = {};
    if (!playerData.anvilUpgrades.move   || typeof playerData.anvilUpgrades.move   !== 'object') playerData.anvilUpgrades.move   = {};
    Neo.MOVE_SLOTS.forEach(slot => {
      const moveKey = playerData.equippedMoves[slot];
      if (!Neo.MOVE_DEFS[moveKey] || Neo.MOVE_DEFS[moveKey].slot !== slot || !isMoveAllowedForCharacter(moveKey, playerData.character)) {
        playerData.equippedMoves[slot] = getDefaultMovesForCharacter(playerData.character)[slot];
      }
      playerData.ownedMoves[playerData.equippedMoves[slot]] = true;
    });
    Object.keys(playerData.ownedMoves).forEach(moveKey => {
      if (!isMoveAllowedForCharacter(moveKey, playerData.character)) delete playerData.ownedMoves[moveKey];
    });
    playerData.insuranceActive = !!playerData.insuranceActive;
    playerData.insuranceChargeKills = Number(playerData.insuranceChargeKills || 0);
    playerData.insuranceReady = playerData.insuranceReady !== false;
    playerData.keenEyeChargeKills = Number(playerData.keenEyeChargeKills || 0);
    playerData.keenEyeReady = !!playerData.keenEyeReady;
    playerData.keenEyeBuffTime = Number(playerData.keenEyeBuffTime || 0);
    playerData.chronoSpringChargeKills = Number(playerData.chronoSpringChargeKills || 0);
    playerData.chronoSpringReady = !!playerData.chronoSpringReady;
    playerData.chronoSpringBuffTime = Number(playerData.chronoSpringBuffTime || 0);
    playerData.critCharmBuffTime = Number(playerData.critCharmBuffTime || 0);
    playerData.escapeChargeKills = Number(playerData.escapeChargeKills || 0);
    playerData.escapeReady = playerData.escapeReady !== false;
    playerData.robotArmChargeKills = Number(playerData.robotArmChargeKills || 0);
    playerData.robotArmReady = !!playerData.robotArmReady;
    playerData.scarfChargeKills = Number(playerData.scarfChargeKills || 0);
    playerData.scarfHealReady = playerData.scarfHealReady !== false;
    return playerData;
  }

export function getCharacterDef() {
    return Neo.CHARACTER_DEFS[Neo.player?.character || Neo.chosenCharacter] || Neo.CHARACTER_DEFS.thorn_knight;
  }

export function getUiCharacterKey() {
    return Neo.player?.character || Neo.chosenCharacter;
  }

const SETTINGS_STORE_KEY = 'neonyke:settings';
let settingsThemeSyncBound = false;

function getSettingsActiveTheme() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return typeof parsed?.activeTheme === 'string' ? parsed.activeTheme : '';
    } catch {
      return '';
    }
  }

export function syncCharacterUiTheme() {
    const activeTheme = getSettingsActiveTheme();
    const hasExplicitTheme = !!activeTheme && activeTheme !== '_custom';
    const princessFromSettings = activeTheme === 'princess';
    const princessFromCharacter = !hasExplicitTheme && getUiCharacterKey() === 'princess';
    document.documentElement.classList.toggle('princess-ui', princessFromSettings || princessFromCharacter);

    if (!settingsThemeSyncBound) {
      settingsThemeSyncBound = true;
      window.addEventListener('neo:settings-changed', syncCharacterUiTheme);
    }
  }

export function getDefaultWeaponForCharacter(characterKey) {
    if (characterKey === 'princess') return 'princess_wand';
    if (characterKey === 'metao') return 'metao_fire_staff';
    if (characterKey === 'granialla') return 'granillia_lightning_spear';
    if (characterKey === 'mooggy') return 'claw_gauntlets';
    return 'thorns_bleed_blade';
  }

export function getDefaultMovesForCharacter(characterKey) {
    if (characterKey === 'princess') {
      return { melee: 'narwal_fight', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' };
    }
    if (characterKey === 'metao') {
      return { melee: 'fire_balls', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' };
    }
    if (characterKey === 'granialla') {
      return { melee: 'smite', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' };
    }
    if (characterKey === 'mooggy') {
      return { melee: 'mooggy_swipe', laser: 'nail_shot', smash: 'fangs_of_death', dash: 'mooggy_zoomies' };
    }
    return { melee: 'slash', laser: 'blood_beam', smash: 'crimson_smash', dash: 'dash' };
  }

export function isMoveAllowedForCharacter(moveKey, characterKey = Neo.player?.character || Neo.chosenCharacter) {
    const def = Neo.MOVE_DEFS[moveKey];
    if (!def) return false;
    return !def.exclusiveCharacter || def.exclusiveCharacter === characterKey;
  }

  // True while the player is concealed from enemy AI: invisible (El Barto's Cape),
  // flying untouchable, mid-warp phase-out, or holding Coward's Way. Enemies should
  // not chase or attack a hidden player.
export function isPlayerHidden(playerData = Neo.player) {
    if (!playerData) return false;
    if (Number(playerData.equipmentEffects?.el_bartos_cape?.time || 0) > 0) return true;
    if (Number(playerData.princessFlightTime || 0) > 0) return true;
    if (Number(playerData.cowardsWayTime || 0) > 0) return true;
    if (Number(playerData.warpHideTime || 0) > 0) return true;
    return false;
  }

export function getItemCount(key) {
    return Number(Neo.player?.items?.[key] || 0);
  }

export function getItemTagCounts(playerData = Neo.player) {
    const counts = {};
    if (!playerData?.items) return counts;
    Neo.ITEM_KEYS.forEach(key => {
      const stacks = Math.max(0, Number(playerData.items[key] || 0));
      if (stacks <= 0) return;
      const tags = Neo.ITEM_DEFS[key]?.tags || Neo.itemRegistry?.get?.(key)?.tags || [];
      const tagList = tags instanceof Set ? [...tags] : tags;
      if (!Array.isArray(tagList)) return;
      tagList.forEach(tag => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + stacks;
      });
    });
    return counts;
  }

export function getActiveBuildTags(playerData = Neo.player, minimumStacks = 3) {
    const counts = getItemTagCounts(playerData);
    return Object.entries(counts)
      .filter(([, count]) => count >= minimumStacks)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }

export function getPotionCarryCap() {
    const stacks = getItemCount('mateos_bag');
    if (stacks <= 0) return 0;
    return 3 + (stacks - 1);
  }

export function getChargeRequirement(baseRequirement) {
    const chargeStacks = getItemTagCounts().charge || 0;
    const synergyReduction = chargeStacks >= 6 ? 2 : chargeStacks >= 3 ? 1 : 0;
    return Math.max(1, baseRequirement - getItemCount('charged_adapter') - synergyReduction);
  }

export function getKeenEyeCritBonus() {
    return getItemCount('keen_eye') * 0.1;
  }

export function getChronoSpringAttackSpeedBonus() {
    return getItemCount('chrono_spring') * 0.16;
  }

export function grantCritCharmBuff() {
    if (!Neo.player || getItemCount('crit_charm') <= 0) return;
    Neo.player.critCharmBuffTime = Math.max(Number(Neo.player.critCharmBuffTime || 0), 2.2);
  }

export function triggerKeenEyeBuff() {
    if (!Neo.player || getItemCount('keen_eye') <= 0) return;
    Neo.player.keenEyeBuffTime = Math.max(Number(Neo.player.keenEyeBuffTime || 0), 7);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.7, text: 'KEEN EYE', c: '#f8fdff' });
  }

export function triggerChronoSpringBuff() {
    if (!Neo.player || getItemCount('chrono_spring') <= 0) return;
    Neo.player.chronoSpringBuffTime = Math.max(Number(Neo.player.chronoSpringBuffTime || 0), 6);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 38, life: 0.7, text: 'CHRONO', c: '#cfeeff' });
  }

export function getItemStats() {
    if (Neo.itemStatsCacheFrame === Neo.frameId && Neo.itemStatsCacheValue) return Neo.itemStatsCacheValue;
    if (!Neo.godItemKeysCache) Neo.godItemKeysCache = Neo.ITEM_KEYS.filter(key => Neo.isGodTier?.(Neo.ITEM_DEFS[key]?.rarity));

    const neoKnife = getItemCount('neo_knife');
  const toothOfThorn = getItemCount('tooth_of_thorn');
    const toughSkin = getItemCount('tough_skin');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const goldVac = getItemCount('gold_vac');
    const doubleDose = getItemCount('double_dose');
    const copycatCharm = getItemCount('copycat_charm');
    const attackServo = getItemCount('attack_servo');
  const enemyMagnet = getItemCount('enemy_magnet');
    const robotArm = getItemCount('robot_arm');
    const scholarSeal = getItemCount('scholar_seal');
    const scholarCap = getItemCount('scholar_cap');
    const bandaid = getItemCount('bandaid');
    const pushMan = getItemCount('push_man');
    const explosiveJelly = getItemCount('explosive_jelly');
    const dragonOrb = getItemCount('dragon_orb');
    const ricocete = getItemCount('ricocete');
    const drinkMaster = getItemCount('drink_master');
    const turtleShell = getItemCount('turtle_shell');
    const anchorCharm = getItemCount('anchor_charm');
    const shieldOfAegis = getItemCount('shield_of_aegis');
    const pendantOfKronos = getItemCount('pendant_of_kronos');
    const richMansLuck = getItemCount('rich_mans_luck');
    const weaponFatigue = getItemCount('weapon_fatigue');
    const genericHealthItem = getItemCount('generic_health_item');
    const snakeKnife = getItemCount('snake_knife');
    const confuseRay = getItemCount('confuse_ray');
    const overclockedWatch = getItemCount('overclocked_watch');
    const overstimulate = getItemCount('overstimulate');
    const graveZone = getItemCount('grave_zone');
    const mooggyZoomies = getItemCount('mooggy_zoomies');
    const homingMissile = getItemCount('homing_missile');
    const oracleLens = getItemCount('oracles_lens') > 0;
    const critCharmBonus = Number(Neo.player?.critCharmBuffTime || 0) > 0 ? getItemCount('crit_charm') * 0.04 : 0;
    const keenEyeBonus = Number(Neo.player?.keenEyeBuffTime || 0) > 0 ? getKeenEyeCritBonus() : 0;
    const chronoSpringBonus = Number(Neo.player?.chronoSpringBuffTime || 0) > 0 ? getChronoSpringAttackSpeedBonus() : 0;
    const equippedWeaponKey = String(Neo.player?.equippedWeapon || '');
    const weaponBleedBonus = equippedWeaponKey === 'claw_gauntlets'
      ? 0.22
      : equippedWeaponKey === 'thorns_bleed_blade'
        ? 0.10
        : 0;
    const weaponCritBonus = equippedWeaponKey === 'hunters_bow'
      ? 0.10
      : equippedWeaponKey === 'void_piercer'
        ? 0.20
        : 0;
    const baseBleedChance = neoKnife * 0.05;
    const tagCounts = getItemTagCounts();
    const healingTagStacks = Number(tagCounts.heal || 0) + Number(tagCounts.healing || 0);
    const godItemStacks = Neo.godItemKeysCache.reduce((total, key) => {
      return total + getItemCount(key);
    }, 0);
    let critChance = critCharmBonus + keenEyeBonus + pendantOfKronos * godItemStacks * 0.01;
    if (oracleLens) critChance *= 2;
    critChance = Neo.clamp(critChance, 0.01, 0.95);
    const damageReduction = Neo.clamp(bandaid * 0.005 + shieldOfAegis * 0.2, 0, 0.85);
    const xpProgress = Neo.clamp((Neo.player?.xpToNext || 0) > 0 ? (Neo.player?.xp || 0) / Neo.player.xpToNext : 0, 0, 1);
    const characterDef = Neo.getCharacterDef?.() || {};
    Neo.itemStatsCacheValue = {
      bleedChance: baseBleedChance,
      weaponBleedChance: weaponBleedBonus,
      displayedBleedChance: baseBleedChance + weaponBleedBonus,
      weaponCritChance: weaponCritBonus,
      displayedCritChance: critChance + weaponCritBonus,
      drainChance: toothOfThorn * 0.028,
      bleedResistance: Neo.clamp(toughSkin * 0.25, 0, 0.8),
      weaponFatigueChance: weaponFatigue * 0.05,
      genericHealthItemHealRatio: genericHealthItem * 0.05,
      snakeKnifePoisonChance: snakeKnife * 0.02,
      confuseRayStunChance: confuseRay * 0.01,
      overclockedWatchChance: overclockedWatch * 0.02,
      overstimulateStunChance: overstimulate * 0.2,
      graveZoneChance: graveZone * 0.2,
      homingMissileChance: homingMissile * 0.15,
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      scarfBleedsOnHit: hemesScarf,
      pickupVacuumRange: goldVac > 0 ? 9999 : 0,
      coinPickupMultiplier: goldVac > 0 ? 2 : 1,
      potionDoubleChance: Neo.clamp(doubleDose * 0.5, 0, 1),
      itemDuplicateChance: Neo.clamp(copycatCharm * 0.3, 0, 1),
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedMultiplier: 1 + attackServo * 0.12 + chronoSpringBonus,
      hasRobotArm: robotArm > 0,
      moveSpeedMultiplier: (1 + turtleShell * 0.05) * (Number(Neo.player?.equipmentEffects?.turbo_boots?.time || 0) > 0 ? 1.55 : 1),
      laserWeightMultiplier: Math.max(0, 1 - turtleShell * 0.01),
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      levelEdgeDamageMultiplier: 1 + scholarCap * xpProgress * 0.45,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: (1 + explosiveJelly * 0.2) * Number(characterDef.aoeRadiusMultiplier || 1),
      aoeDamageMultiplier: Number(characterDef.aoeDamageMultiplier || 1),
      beamDamageMultiplier: 1 + dragonOrb * 0.35,
      beamChainTargets: dragonOrb > 0 ? Math.min(2, dragonOrb) : 0,
      beamChainDamageMultiplier: dragonOrb > 0 ? 0.6 + (dragonOrb - 1) * 0.15 : 0,
      projectileBounces: ricocete,
      projectilePierceBonus: tagCounts.projectile >= 9 ? 2 : tagCounts.projectile >= 4 ? 1 : 0,
      projectileHomingStrength: enemyMagnet * 0.05,
      projectileSpeedMultiplier: 1 + mooggyZoomies * 0.2,
      healingMultiplier: 1 + drinkMaster * 0.2,
      overhealBarrierRatio: healingTagStacks >= 3 ? 0.35 : 0,
      overhealBarrierCapRatio: healingTagStacks >= 6 ? 0.28 : healingTagStacks >= 3 ? 0.16 : 0,
      itemDropChanceBonus: Math.min(0.3, richMansLuck * 0.05),
      shopExtraItemOffers: Math.min(3, richMansLuck),
      damageReduction,
      stunResistance: anchorCharm,
      hasIronLung: getItemCount('iron_lung') > 0,
      hasPrincesGlasses: getItemCount('princes_glasses') > 0,
      tagCounts,
      bleedCritChance: tagCounts.bleed >= 8 ? 0.18 : tagCounts.bleed >= 3 ? 0.08 : 0,
      bleedSplashStacks: tagCounts.bleed >= 5 ? Math.min(3, 1 + Math.floor((tagCounts.bleed - 5) / 4)) : 0,
      statusDurationMultiplier: tagCounts.wizard >= 4 ? 1.18 : 1,
      aoeStatusDurationMultiplier: tagCounts.wizard >= 7 ? 1.28 : tagCounts.wizard >= 4 ? 1.14 : 1,
      chargeSynergyReduction: tagCounts.charge >= 6 ? 2 : tagCounts.charge >= 3 ? 1 : 0,
      buildTags: getActiveBuildTags(),
    };
    Neo.itemStatsCacheFrame = Neo.frameId;
    return Neo.itemStatsCacheValue;
  }

export function getAttackSpeedValue() {
    const stats = getItemStats();
    const robotArmMultiplier = stats.hasRobotArm && Neo.player?.robotArmReady ? 8 : 1;
    return Math.max(0.2, (Neo.player?.attackSpeed || 1) * (stats.attackSpeedMultiplier || 1) * robotArmMultiplier);
  }

export function applyPlayerHealing(amount, options = {}) {
    if (!Neo.player) return 0;
    const healAmount = Math.max(0, Number(amount || 0));
    if (healAmount <= 0) return 0;
    const beforeHp = Number(Neo.player.hp || 0);
    const maxHp = Math.max(1, Number(Neo.player.maxHp || 1));
    const missing = Math.max(0, maxHp - beforeHp);
    const gained = Math.min(missing, healAmount);
    if (gained > 0) {
      Neo.player.hp = Math.min(maxHp, beforeHp + gained);
      window.achievementEvents?.emit('heal:applied', { amount: gained });
    }
    const overflow = Math.max(0, healAmount - gained);
    const stats = Neo.getItemStats?.() || {};
    const barrierRatio = Number(stats.overhealBarrierRatio || 0);
    const barrierCap = maxHp * Number(stats.overhealBarrierCapRatio || 0);
    if (overflow > 0 && barrierRatio > 0 && barrierCap > 0) {
      const addedBarrier = Math.min(barrierCap - Number(Neo.player.overhealBarrier || 0), overflow * barrierRatio);
      if (addedBarrier > 0) {
        Neo.player.overhealBarrier = Math.min(barrierCap, Number(Neo.player.overhealBarrier || 0) + addedBarrier);
        if (options.showBarrier !== false && Neo.spawnHealPopup) {
          Neo.spawnHealPopup(Neo.player.x + Neo.rand(-8, 8), Neo.player.y - 36, addedBarrier, { color: '#9cefff', size: 12 });
        }
      }
    }
    if ((gained > 0 || overflow > 0) && Neo.player.character === 'granialla') {
      const now = Number(Neo.frameId || 0);
      if (now - Number(Neo.player.graniallaHealPulseFrame || -9999) >= 24) {
        Neo.player.graniallaHealPulseFrame = now;
        const radius = 86;
        const pulseDamage = Math.max(2, Math.min(18, (gained + overflow) * 0.45));
        Neo.forEachEnemyNearCircle?.(Neo.player.x, Neo.player.y, radius + 80, enemy => {
          if (Neo.dist(Neo.player.x, Neo.player.y, enemy.x, enemy.y) > radius + enemy.r) return;
          Neo.hitEnemy?.(enemy, pulseDamage, Math.atan2(enemy.y - Neo.player.y, enemy.x - Neo.player.x), 55, '#dfffea', { rawDamage: true, noCharmBuff: true });
        });
        Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y, life: 0.25, ring: radius, c: '#dfffea' });
      }
    }
    return gained;
  }

export function getWizardPawStatCards() {
    const stats = getItemStats();
    return [
      { label: 'HP', value: `${Math.round(Neo.player.hp)} / ${Math.round(Neo.player.maxHp)}` },
      { label: 'Attack Power', value: `${Math.round(Neo.player.attackPower)}` },
      { label: 'Attack Speed', value: getAttackSpeedValue().toFixed(2) },
      { label: 'Crit Chance', value: `${Math.round(stats.critChance * 100)}%` },
      { label: 'Move Speed', value: `${Math.round(stats.moveSpeedMultiplier * 100)}%` },
    ];
  }

// Pickup records an owed paw on the player (persists with the run save) and
// asks the dispatcher to open the modal when it is safe to do so. The selection
// is never silently dropped: if the modal can't open now it stays queued.
export function openWizardPawSelection() {
    if (!Neo.player) return;
    Neo.player.wizardPawPendingCount = Math.max(0, Math.floor(Number(Neo.player.wizardPawPendingCount || 0))) + 1;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 1, text: "WIZARD'S PAW!", c: '#ffd27d' });
    Neo.scheduleRunSave?.();
    // Opened the modal now? Done. Otherwise leave a reminder — the choice is owed.
    if (!requestPanelItemSelection()) notifyPanelItemDeferred('wizards_paw');
  }

// Actually build and show the time-stop modal for one owed paw. Guarded by the
// caller (requestPanelItemSelection) so it only fires when safe and not already open.
function beginWizardPawModal() {
    Neo.wizardPawSelection = {
      picks: [],
      options: [
        { key: 'maxHp', name: 'Max HP', description: `Current ${Math.round(Neo.player.maxHp)}. Increase max HP by 50% and scale current HP with it.` },
        { key: 'attackPower', name: 'Attack Power', description: `Current ${Math.round(Neo.player.attackPower)}. Increase raw attack power by 50%.` },
        { key: 'attackSpeed', name: 'Attack Speed', description: `Current ${getAttackSpeedValue().toFixed(2)}. Increase base attack speed by 50%.` },
      ],
    };
    Neo.setWizardPawModalOpen(true);
    renderWizardPawPanel();
  }

// Single entry point that decides whether to open a pending panel-item selection
// now or leave it queued. Safe to call repeatedly (idempotent): guarded by the
// owed counts and the already-open checks, so it can be wired into pause/resume,
// panel-close, room-entry and HUD-refresh hooks without any polling timer.
export function requestPanelItemSelection(options = {}) {
    const player = Neo.player;
    if (!player) return false;
    const pawPending = Math.max(0, Math.floor(Number(player.wizardPawPendingCount || 0)));
    const batteryPending = Math.max(0, Math.floor(Number(player.extraBatteryPendingCount || 0)));
    if (pawPending <= 0 && batteryPending <= 0) return false;
    // Don't fight a cinematic, transition, death, or another blocking overlay.
    if (Neo.gameState !== 'play') return false;
    // The paw modal is itself a blocking overlay; if it's already up, wait for confirm.
    if (Neo.isWizardPawOpen?.()) return false;
    if (Neo.isOverlayBlockingInput?.()) return false;
    // Paw first: it stops time and is the higher-tier reward.
    if (pawPending > 0) {
      beginWizardPawModal();
      return true;
    }
    // The battery prompt re-uses the inventory panel. When the player just
    // dismissed the inventory we must NOT auto-reopen it (that would trap them);
    // they re-open it themselves via the HUD alert chip. Callers that close the
    // inventory pass { suppressBatteryOpen: true } for exactly this reason.
    if (options.suppressBatteryOpen) return false;
    if (batteryPending > 0) {
      Neo.activeInvPlayer = 1;
      Neo.activeInvTab = 'equipped';
      Neo.activeInventorySlot = '';
      Neo.markInventoryPanelDirty?.();
      Neo.setInventoryPanelOpen?.(true);
      Neo.renderInventoryPanel?.();
      return true;
    }
    return false;
  }

// Pickup couldn't open the selection right now (boss cinematic, transition,
// shop/anvil open, ...). Show one reminder toast so the player knows a choice is
// owed, gated to at most once per room so retries don't spam.
function notifyPanelItemDeferred(itemKey) {
    if (Neo.panelItemDeferredToastRoom === Neo.currentRoom) return;
    Neo.panelItemDeferredToastRoom = Neo.currentRoom || null;
    Neo.pushItemNotification?.(itemKey, 1, '— choice pending. Resolve it from the red banner / objectives.');
  }

export function renderWizardPawPanel() {
    if (!Neo.wizardPawSelection || !Neo.ui.wizardPawStats || !Neo.ui.wizardPawChoices) return;
    Neo.ui.wizardPawStats.innerHTML = getWizardPawStatCards()
      .map(stat => `<div class="wizard-paw-stat"><span class="wizard-paw-stat__label">${stat.label}</span><div class="wizard-paw-stat__value">${stat.value}</div></div>`)
      .join('');
    Neo.ui.wizardPawChoices.innerHTML = Neo.wizardPawSelection.options
      .map(option => {
        const selected = Neo.wizardPawSelection.picks.includes(option.key);
        return `<button class="wizard-paw-choice${selected ? ' is-selected' : ''}" type="button" data-stat="${option.key}">
          <span class="wizard-paw-choice__eyebrow">${selected ? 'Selected' : 'Choose'}</span>
          <h4>${option.name}</h4>
          <p>${option.description}</p>
        </button>`;
      })
      .join('');
    if (Neo.ui.wizardPawConfirm) {
      Neo.ui.wizardPawConfirm.disabled = Neo.wizardPawSelection.picks.length !== 2;
      Neo.ui.wizardPawConfirm.textContent = Neo.wizardPawSelection.picks.length === 2
        ? 'CONFIRM PICKS'
        : `PICK ${2 - Neo.wizardPawSelection.picks.length} MORE`;
    }
  }

export function handleWizardPawChoiceClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-stat]') : null;
    const statKey = target?.dataset?.stat || '';
    if (!Neo.wizardPawSelection || !statKey) return;
    const picks = Neo.wizardPawSelection.picks;
    const index = picks.indexOf(statKey);
    if (index >= 0) picks.splice(index, 1);
    else if (picks.length < 2) picks.push(statKey);
    renderWizardPawPanel();
  }

export function applyWizardPawStat(stat) {
    const boost = 1.5;
    if (stat === 'maxHp') {
      const previousMaxHp = Math.max(1, Number(Neo.player.maxHp || 120));
      const nextMaxHp = Math.round(previousMaxHp * boost);
      Neo.player.maxHp = nextMaxHp;
      Neo.player.hp = Math.min(nextMaxHp, Math.round(Number(Neo.player.hp || previousMaxHp) * boost));
      return;
    }
    if (stat === 'attackPower') {
      Neo.player.attackPower = Math.max(3, Math.round(Neo.player.attackPower * boost));
      return;
    }
    if (stat === 'attackSpeed') {
      Neo.player.attackSpeed = Math.max(0.2, Neo.player.attackSpeed * boost);
    }
  }

export function confirmWizardPawSelection() {
    if (!Neo.wizardPawSelection || Neo.wizardPawSelection.picks.length !== 2) return;
    Neo.wizardPawSelection.picks.forEach(applyWizardPawStat);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 1, text: 'PAW APPLIED!', c: '#ffd27d' });
    Neo.wizardPawSelection = null;
    Neo.setWizardPawModalOpen(false);
    if (Neo.player) {
      Neo.player.wizardPawPendingCount = Math.max(0, Math.floor(Number(Neo.player.wizardPawPendingCount || 0)) - 1);
    }
    Neo.markInventoryPanelDirty();
    Neo.renderInventoryPanel();
    Neo.updateHud();
    Neo.scheduleRunSave();
    // Chain into the next owed paw/battery (if any) now that the modal is closed.
    requestPanelItemSelection();
  }

function ensureMoveStackOverrides(playerData = Neo.player) {
    if (!playerData || typeof playerData !== 'object') return null;
    if (!playerData.moveStackOverrides || typeof playerData.moveStackOverrides !== 'object') {
      playerData.moveStackOverrides = {};
    }
    return playerData.moveStackOverrides;
  }

export function openExtraBatterySelection(playerData = Neo.player) {
    if (!playerData) return;
    playerData.extraBatteryPendingCount = Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0))) + 1;
    Neo.scheduleRunSave?.();
    // Co-op AI / non-active players just bank the charge; only the active player
    // gets the inventory prompt, routed through the dispatcher so it respects
    // the safe-to-open checks and paw priority.
    if (playerData !== Neo.player) return;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 0.9, text: 'SELECT A MOVE', c: '#cfd7ff' });
    if (!requestPanelItemSelection()) notifyPanelItemDeferred('extra_battery');
  }

export function grantExtraBatteryToMove(moveKey, playerData = Neo.player) {
    if (!playerData || !Neo.MOVE_DEFS[moveKey]) return 0;
    const overrides = ensureMoveStackOverrides(playerData);
    if (!overrides) return 0;
    const nextMaxStacks = Neo.getMoveMaxStacks(moveKey, playerData.character, playerData) + 1;
    overrides[moveKey] = nextMaxStacks;
    playerData.extraBatteryPendingCount = Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0)) - 1);
    if (playerData === Neo.player) {
      const slot = Neo.MOVE_DEFS[moveKey]?.slot || '';
      if (slot && playerData.equippedMoves?.[slot] === moveKey) {
        const entry = Neo.createCooldownEntry(slot, playerData, Neo.cooldowns[slot]);
        // The extra battery just raised maxCharges by 1. createCooldownEntry
        // preserves the existing charges/timers, so when the move was mid-
        // cooldown the freshly-added slot is neither ready nor recharging — it
        // would silently vanish. Credit the new capacity as a ready charge so
        // the player immediately sees (and can use) the charge they paid for.
        const accounted = entry.charges + entry.timers.length + entry.holding;
        if (accounted < entry.maxCharges) {
          entry.charges = Math.min(entry.maxCharges, entry.charges + (entry.maxCharges - accounted));
        }
        Neo.cooldowns[slot] = entry;
      }
      Neo.markInventoryPanelDirty?.();
      Neo.updateHud?.();
      Neo.scheduleRunSave?.();
    }
    return nextMaxStacks;
  }

export function consumeCharge(chargeType) {
    if (chargeType === 'insurance') {
      Neo.player.insuranceReady = false;
      Neo.player.insuranceChargeKills = 0;
      Neo.player.insuranceActive = false;
      return;
    }
    if (chargeType === 'keen_eye') {
      Neo.player.keenEyeReady = false;
      Neo.player.keenEyeChargeKills = 0;
      return;
    }
    if (chargeType === 'chrono_spring') {
      Neo.player.chronoSpringReady = false;
      Neo.player.chronoSpringChargeKills = 0;
      return;
    }
    if (chargeType === 'escape') {
      Neo.player.escapeReady = false;
      Neo.player.escapeChargeKills = 0;
    }
    if (chargeType === 'robot_arm') {
      Neo.player.robotArmReady = false;
      Neo.player.robotArmChargeKills = 0;
    }
    if (chargeType === 'hemes_scarf') {
      Neo.player.scarfHealReady = false;
      Neo.player.scarfChargeKills = 0;
    }
  }

  window.achievementEvents?.on('charge:kill', () => {
    if (!Neo.player) return;
    const stats = getItemStats();
    const chargeSteps = (stats.overclockedWatchChance > 0 && Neo.nextRandom('encounter') < stats.overclockedWatchChance ? 2 : 1)
      + (Neo.isChallengeActive?.('overcharged') ? 1 : 0);
    if (stats.genericHealthItemHealRatio > 0 && Neo.player.hp < Neo.player.maxHp) {
      const heal = Neo.scalePlayerHealing(Math.max(0, Neo.player.hp * stats.genericHealthItemHealRatio));
      const gained = Neo.applyPlayerHealing(heal);
      if (gained > 0) {
        Neo.spawnHealPopup(Neo.player.x, Neo.player.y - 22, gained, { color: '#d9ffe5' });
      }
    }

    if (getItemCount('insurance') > 0 && !Neo.player.insuranceReady) {
      Neo.player.insuranceChargeKills += chargeSteps;
      if (Neo.player.insuranceChargeKills >= getChargeRequirement(9)) {
        Neo.player.insuranceReady = true;
        Neo.player.insuranceChargeKills = 0;
        Neo.player.insuranceActive = false;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'INSURANCE READY', c: '#e8ecff' });
      }
    }

    if (getItemCount('keen_eye') > 0 && !Neo.player.keenEyeReady) {
      Neo.player.keenEyeChargeKills += chargeSteps;
      if (Neo.player.keenEyeChargeKills >= getChargeRequirement(10)) {
        Neo.player.keenEyeReady = true;
        Neo.player.keenEyeChargeKills = 0;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'KEEN READY', c: '#f2fbff' });
      }
    }

    if (getItemCount('chrono_spring') > 0 && !Neo.player.chronoSpringReady) {
      Neo.player.chronoSpringChargeKills += chargeSteps;
      if (Neo.player.chronoSpringChargeKills >= getChargeRequirement(7)) {
        Neo.player.chronoSpringReady = true;
        Neo.player.chronoSpringChargeKills = 0;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 36, life: 0.7, text: 'SPRING READY', c: '#d9f7ff' });
      }
    }

    if (getItemCount('charged_adapter') > 0 && !Neo.player.escapeReady) {
      Neo.player.escapeChargeKills += chargeSteps;
      if (Neo.player.escapeChargeKills >= getChargeRequirement(10)) {
        Neo.player.escapeReady = true;
        Neo.player.escapeChargeKills = 0;
        const slotIdx = Neo.player?.equipmentSlots?.indexOf?.('charged_adapter') ?? -1;
        const slotLetter = slotIdx >= 0 ? (Neo.EQUIPMENT_SLOT_KEYS?.[slotIdx] || 'F') : 'F';
        const warpHint = Neo.formatControlLabel(slotLetter.toLowerCase(), slotLetter.toLowerCase());
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 36, life: 0.9, text: `ADAPTER READY - PRESS ${warpHint}`, c: '#b88cff' });
      }
    }

    if (getItemCount('robot_arm') > 0 && !Neo.player.robotArmReady) {
      Neo.player.robotArmChargeKills += chargeSteps;
      if (Neo.player.robotArmChargeKills >= getChargeRequirement(8)) {
        Neo.player.robotArmReady = true;
        Neo.player.robotArmChargeKills = 0;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'ARM READY', c: '#a9e6ff' });
      }
    }

    if (getItemCount('hemes_scarf') > 0 && !Neo.player.scarfHealReady) {
      Neo.player.scarfChargeKills += chargeSteps;
      if (Neo.player.scarfChargeKills >= getChargeRequirement(6)) {
        Neo.player.scarfHealReady = true;
        Neo.player.scarfChargeKills = 0;
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.7, text: 'SCARF READY', c: '#0f8' });
      }
    }
  });

export function refreshFloorChargeStates() {
    if (!Neo.player) return;
    Neo.player.insuranceActive = false;
    Neo.player.critCharmBuffTime = 0;
    Neo.player.keenEyeBuffTime = 0;
    Neo.player.chronoSpringBuffTime = 0;
  }

  // Expose on Neo
  Neo.migratePlayerData = migratePlayerData;
  Neo.getCharacterDef = getCharacterDef;
  Neo.getUiCharacterKey = getUiCharacterKey;
  Neo.syncCharacterUiTheme = syncCharacterUiTheme;
  Neo.getDefaultWeaponForCharacter = getDefaultWeaponForCharacter;
  Neo.getDefaultMovesForCharacter = getDefaultMovesForCharacter;
  Neo.isMoveAllowedForCharacter = isMoveAllowedForCharacter;
  Neo.isPlayerHidden = isPlayerHidden;
  Neo.getItemCount = getItemCount;
  Neo.getItemTagCounts = getItemTagCounts;
  Neo.getActiveBuildTags = getActiveBuildTags;
  Neo.getPotionCarryCap = getPotionCarryCap;
  Neo.getChargeRequirement = getChargeRequirement;
  Neo.getKeenEyeCritBonus = getKeenEyeCritBonus;
  Neo.getChronoSpringAttackSpeedBonus = getChronoSpringAttackSpeedBonus;
  Neo.grantCritCharmBuff = grantCritCharmBuff;
  Neo.triggerKeenEyeBuff = triggerKeenEyeBuff;
  Neo.triggerChronoSpringBuff = triggerChronoSpringBuff;
  Neo.getItemStats = getItemStats;
  Neo.getAttackSpeedValue = getAttackSpeedValue;
  Neo.applyPlayerHealing = applyPlayerHealing;
  Neo.getWizardPawStatCards = getWizardPawStatCards;
  Neo.openWizardPawSelection = openWizardPawSelection;
  Neo.requestPanelItemSelection = requestPanelItemSelection;
  Neo.renderWizardPawPanel = renderWizardPawPanel;
  Neo.handleWizardPawChoiceClick = handleWizardPawChoiceClick;
  Neo.applyWizardPawStat = applyWizardPawStat;
  Neo.confirmWizardPawSelection = confirmWizardPawSelection;
  Neo.openExtraBatterySelection = openExtraBatterySelection;
  Neo.grantExtraBatteryToMove = grantExtraBatteryToMove;
  Neo.consumeCharge = consumeCharge;
  Neo.refreshFloorChargeStates = refreshFloorChargeStates;
