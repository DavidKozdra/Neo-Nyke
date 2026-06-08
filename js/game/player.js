// player.js — Player data migration, stats, abilities, charge.

// Moves renamed across versions: { oldSavedKey: currentKey }. Applied during
// migration so saves referencing the old key keep the move.
const RENAMED_MOVE_KEYS = {
  fangs_of_death: 'random_pounce',
};

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
    playerData.scrollUseSerial = Math.max(0, Math.floor(Number(playerData.scrollUseSerial || 0)));
    // Scrolls picked up/bought open their selection popup on acquisition. Any that
    // couldn't open immediately (shop/cinematic) wait here until presentable.
    playerData.scrollPendingQueue = Array.isArray(playerData.scrollPendingQueue)
      ? playerData.scrollPendingQueue.filter(key => SCROLL_KEYS.has(key))
      : [];
    playerData.scrollBranchingTargets = (playerData.scrollBranchingTargets && typeof playerData.scrollBranchingTargets === 'object') ? playerData.scrollBranchingTargets : {};
    playerData.scrollReplaceMap = (playerData.scrollReplaceMap && typeof playerData.scrollReplaceMap === 'object') ? playerData.scrollReplaceMap : {};
    playerData.scrollPoolWeights = Array.isArray(playerData.scrollPoolWeights) ? playerData.scrollPoolWeights.filter(buff => buff && buff.tag) : [];
    if (playerData.scrollAbundance && typeof playerData.scrollAbundance === 'object') {
      playerData.scrollAbundance.items = Array.isArray(playerData.scrollAbundance.items) ? playerData.scrollAbundance.items.filter(key => Neo.ITEM_DEFS[key]).slice(0, 2) : [];
      playerData.scrollAbundance.nextCheckFloor = Math.max(1, Math.floor(Number(playerData.scrollAbundance.nextCheckFloor || 1)));
      playerData.scrollAbundance.expiresFloor = Math.max(1, Math.floor(Number(playerData.scrollAbundance.expiresFloor || 1)));
    } else {
      delete playerData.scrollAbundance;
    }
    playerData.scrollEgoFloor = Math.max(0, Math.floor(Number(playerData.scrollEgoFloor || 0)));
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
    playerData.mooggySwipeCharge = Number(playerData.mooggySwipeCharge || 0);
    playerData.lavaWalkTime = Number(playerData.lavaWalkTime || 0);
    playerData.lavaTrailTick = Number(playerData.lavaTrailTick || 0);
    playerData.princessFlightTime = Number(playerData.princessFlightTime || 0);
    playerData.overhealBarrier = Math.max(0, Number(playerData.overhealBarrier || 0));
    playerData.gellehHealPulseFrame = Number(playerData.gellehHealPulseFrame || 0);
    Neo.ensureStatuses(playerData);
    if (!playerData.equippedMoves || typeof playerData.equippedMoves !== 'object') {
      playerData.equippedMoves = getDefaultMovesForCharacter(playerData.character);
    }
    if (!playerData.ownedMoves || typeof playerData.ownedMoves !== 'object') {
      playerData.ownedMoves = {};
    }
    // Back-compat: remap moves renamed across versions so old saves keep them
    // instead of silently resetting to the character default.
    Object.entries(RENAMED_MOVE_KEYS).forEach(([oldKey, newKey]) => {
      Neo.MOVE_SLOTS.forEach(slot => {
        if (playerData.equippedMoves[slot] === oldKey) playerData.equippedMoves[slot] = newKey;
      });
      if (playerData.ownedMoves[oldKey]) {
        playerData.ownedMoves[newKey] = true;
        delete playerData.ownedMoves[oldKey];
      }
    });
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
    playerData.weaponChargeKey = typeof playerData.weaponChargeKey === 'string' ? playerData.weaponChargeKey : '';
    playerData.weaponCharges = Math.max(0, Math.floor(Number(playerData.weaponCharges ?? 0)));
    playerData.weaponMaxCharges = Math.max(0, Math.floor(Number(playerData.weaponMaxCharges ?? 0)));
    playerData.weaponChargeTimers = Array.isArray(playerData.weaponChargeTimers)
      ? playerData.weaponChargeTimers.map(value => Number(value)).filter(value => value > 0)
      : [];
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
    if (characterKey === 'gelleh') return 'gelleh_lightning_spear';
    if (characterKey === 'mooggy') return 'claw_gauntlets';
    return 'thorns_bleed_blade';
  }

export function getDefaultMovesForCharacter(characterKey) {
    // The melee slot is the bare-hands fallback only: it is the attack you get
    // when no weapon is equipped, so every character defaults to the generic
    // `slash`. Signature melee attacks (smite, fire_balls, narwal_fight,
    // mooggy_swipe) live on each character's weapon, not the M1 move slot.
    if (characterKey === 'princess') {
      return { melee: 'slash', laser: 'love_beam', smash: 'kicky_kick', dash: 'flying_unhitable' };
    }
    if (characterKey === 'metao') {
      return { melee: 'slash', laser: 'power_disks', smash: 'chaos_burst', dash: 'warp' };
    }
    if (characterKey === 'gelleh') {
      return { melee: 'slash', laser: 'blade_justice', smash: 'healing_zone', dash: 'zip_lightning' };
    }
    if (characterKey === 'mooggy') {
      return { melee: 'slash', laser: 'nail_shot', smash: 'random_pounce', dash: 'mooggy_zoomies' };
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
    return getItemCount('keen_eye') * 0.2;
  }

export function getKeenEyeCritDamageBonus() {
    return getItemCount('keen_eye') * 0.025;
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
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.7, text: 'GLITTER', c: '#f8fdff' });
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
    const procyPickle = getItemCount('procy_pickle');
    // Count distinct tool relics the player owns (items flagged `tool: true`),
    // so Procy Pickle's poison-on-tool-use chance scales with how tool-heavy the
    // build is. Procy Pickle itself isn't a tool, so it never counts toward this.
    const ownedToolCount = procyPickle > 0
      ? Neo.ITEM_KEYS.reduce((total, key) => (
          getItemCount(key) > 0 && Neo.ITEM_DEFS[key]?.tool ? total + 1 : total
        ), 0)
      : 0;
    const oracleLens = getItemCount('oracles_lens') > 0;
    const critCharmBonus = Number(Neo.player?.critCharmBuffTime || 0) > 0 ? getItemCount('crit_charm') * 0.04 : 0;
    const keenEyeActive = Number(Neo.player?.keenEyeBuffTime || 0) > 0;
    const keenEyeBonus = keenEyeActive ? getKeenEyeCritBonus() : 0;
    const keenEyeCritDamageBonus = keenEyeActive ? getKeenEyeCritDamageBonus() : 0;
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
    const activeTurboStacks = Number(Neo.player?.equipmentEffects?.turbo_boots?.time || 0) > 0
      ? Math.max(1, Math.floor(Number(Neo.player?.equipmentEffects?.turbo_boots?.stacks || getItemCount('turbo_boots') || 1)))
      : 0;
    const activeGoldVacStacks = Number(Neo.player?.equipmentEffects?.gold_vac?.time || 0) > 0
      ? Math.max(1, Math.floor(Number(Neo.player?.equipmentEffects?.gold_vac?.stacks || getItemCount('gold_vac') || 1)))
      : 0;
    const godItemStacks = Neo.godItemKeysCache.reduce((total, key) => {
      return total + getItemCount(key);
    }, 0);
    const princesGlasses = getItemCount('princes_glasses');
    // Prince's Glasses: first stack grants a flat bonus, each extra stack a smaller one.
    const princesGlassesCrit = princesGlasses > 0 ? 0.05 + (princesGlasses - 1) * 0.02 : 0;
    const princesGlassesDefense = princesGlasses > 0 ? 0.10 + (princesGlasses - 1) * 0.02 : 0;
    let critChance = critCharmBonus + keenEyeBonus + pendantOfKronos * godItemStacks * 0.01 + princesGlassesCrit;
    if (oracleLens) critChance *= 2;
    critChance = Neo.clamp(critChance, 0.01, 0.95);
    const damageReduction = Neo.clamp(bandaid * 0.005 + shieldOfAegis * 0.2 + princesGlassesDefense, 0, 0.85);
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
      // Tough Skin also makes bleed wear off faster: each stack speeds the bleed
      // timer decay by 20% (so bleeds tick fewer times), capped at 3x faster.
      bleedDurationDecayMultiplier: Neo.clamp(1 + toughSkin * 0.2, 1, 3),
      weaponFatigueChance: weaponFatigue * 0.05,
      weaponFatigueFreezeChance: weaponFatigue * 0.02,
      genericHealthItemHealRatio: genericHealthItem * 0.05,
      snakeKnifePoisonChance: snakeKnife * 0.02,
      confuseRayStunChance: Neo.clamp(confuseRay * 0.05, 0, 0.45),
      overclockedWatchChance: overclockedWatch * 0.02,
      overstimulateStunChance: overstimulate * 0.2,
      graveZoneChance: graveZone * 0.2,
      homingMissileChance: homingMissile * 0.15,
      // Procy Pickle: chance to spread an enemy's statuses to nearby foes when you
      // crit or a status-applying item procs (+5% per stack, capped 60%), and the
      // chance for a tool activation to splash self-spreading poison (2% per stack
      // per tool owned, capped 75%).
      procyPickleSpreadChance: Neo.clamp(procyPickle * 0.05, 0, 0.6),
      procyPickleToolPoisonChance: Neo.clamp(procyPickle * 0.02 * ownedToolCount, 0, 0.75),
      bleedDamageMultiplier: orbOfBlood > 0 ? 1 + orbOfBlood : 1,
      bleedHealScale: hemesScarf,
      passiveBleedStacks: hemesScarf,
      scarfBleedsOnHit: hemesScarf,
      pickupVacuumRange: activeGoldVacStacks > 0 ? 9999 : 0,
      coinPickupMultiplier: activeGoldVacStacks > 0 ? 2 + (activeGoldVacStacks - 1) * 0.5 : 1,
      potionDoubleChance: Neo.clamp(doubleDose * 0.5, 0, 1),
      itemDuplicateChance: Neo.clamp(copycatCharm * 0.3, 0, 1),
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6) + keenEyeCritDamageBonus,
      attackSpeedMultiplier: 1 + attackServo * 0.12 + chronoSpringBonus,
      hasRobotArm: robotArm > 0,
      moveSpeedMultiplier: (1 + turtleShell * 0.05) * (activeTurboStacks > 0 ? 1.55 + (activeTurboStacks - 1) * 0.15 : 1),
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
      // 15% per stack, plus a quadratic bonus of 2% × stacks per stack
      // (so n stacks = 0.15n + 0.02n²): homing ramps up the more you invest.
      projectileHomingStrength: enemyMagnet * 0.15 + enemyMagnet * enemyMagnet * 0.02,
      projectileSpeedMultiplier: 1 + mooggyZoomies * 0.2,
      healingMultiplier: 1 + drinkMaster * 0.2,
      overhealBarrierRatio: healingTagStacks >= 3 ? 0.35 : 0,
      overhealBarrierCapRatio: healingTagStacks >= 6 ? 0.28 : healingTagStacks >= 3 ? 0.16 : 0,
      itemDropChanceBonus: Math.min(0.3, richMansLuck * 0.05),
      shopExtraItemOffers: Math.min(3, richMansLuck),
      damageReduction,
      stunResistance: anchorCharm,
      hasIronLung: getItemCount('iron_lung') > 0,
      hasPrincesGlasses: princesGlasses > 0,
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

      // only play the heal sound if it hasn't been played in the last 2 seconds (~120 frames)
      const nowFrame = Number(Neo.frameId || 0);
      if (nowFrame - Number(Neo.player.lastHealSfxFrame || -9999) >= 120) {
        Neo.player.lastHealSfxFrame = nowFrame;
        Neo.playSfx?.('heal_player');
      }
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
    if ((gained > 0 || overflow > 0) && Neo.player.character === 'gelleh') {
      const now = Number(Neo.frameId || 0);
      if (now - Number(Neo.player.gellehHealPulseFrame || -9999) >= 24) {
        Neo.player.gellehHealPulseFrame = now;
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
    const scrollPending = Array.isArray(player.scrollPendingQueue) && player.scrollPendingQueue.length > 0;
    if (pawPending <= 0 && batteryPending <= 0 && !scrollPending) return false;
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
    // Scrolls next: each owed scroll opens its own control modal.
    if (scrollPending) {
      beginScrollControlSelection(player.scrollPendingQueue[0]);
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

  // Scrolls are their own system (Neo.SCROLL_DEFS); this set mirrors its keys so
  // scrolls stay out of relic pools/choices. Resolved lazily since Neo.SCROLL_KEYS
  // is assigned during input.js init. Falls back to the known list pre-init.
  const SCROLL_KEYS = {
    has(key) {
      const keys = Neo.SCROLL_KEYS || ['scroll_reroll', 'scroll_branching', 'scroll_replace', 'scroll_abundance', 'scroll_pool_weight', 'scroll_ego'];
      return keys.includes(key);
    },
  };

  function getScrollChoiceItems({ ownedOnly = false, rarity = '', exclude = [] } = {}) {
    // SCROLL_KEYS is a {has()} shim (not iterable), so filter scrolls out via .has()
    // rather than spreading it — spreading silently excluded nothing before.
    const excluded = new Set(exclude);
    const owned = Neo.player?.items || {};
    return (Neo.ITEM_KEYS || [])
      .filter(key => Neo.ITEM_DEFS?.[key] && !excluded.has(key) && !SCROLL_KEYS.has(key))
      .filter(key => !ownedOnly || Number(owned[key] || 0) > 0)
      .filter(key => !rarity || String(Neo.ITEM_DEFS[key]?.rarity || '').toLowerCase() === rarity)
      .map(key => {
        const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS[key];
        return {
          key,
          type: 'item',
          name: item?.name || Neo.titleCase?.(key) || key,
          description: item?.description || '',
          rarity: item?.rarity || item?.category || 'knight',
          color: item?.color || Neo.getRarityNameColor?.(item?.rarity) || '#d8e9ff',
          search: `${item?.name || key} ${item?.description || ''} ${item?.rarity || ''} ${(item?.tags || []).join(' ')}`.toLowerCase(),
        };
      });
  }

  function getScrollTagChoices() {
    const tags = new Map();
    (Neo.ITEM_KEYS || []).forEach(key => {
      if (SCROLL_KEYS.has(key)) return;
      const item = Neo.ITEM_DEFS?.[key];
      const list = Array.isArray(item?.tags) ? item.tags : [];
      list.forEach(tag => {
        const clean = String(tag || '').trim();
        if (!clean || clean === 'god' || clean === 'wizard') return;
        tags.set(clean, (tags.get(clean) || 0) + 1);
      });
    });
    return [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({
        key: tag,
        type: 'tag',
        name: tag.replace(/_/g, ' '),
        description: `${count} relics use this tag.`,
        rarity: 'knight',
        color: '#c8e2ff',
        search: `${tag} ${count}`.toLowerCase(),
      }));
  }

  function getScrollControlConfig(scrollKey, phase = 'main') {
    const item = Neo.SCROLL_DEFS?.[scrollKey] || Neo.itemRegistry?.get?.(scrollKey) || Neo.ITEM_DEFS?.[scrollKey];
    if (scrollKey === 'scroll_reroll') {
      return {
        title: 'SCROLL OF REROLL',
        copy: 'Choose one owned relic. One stack is replaced by a seeded relic of the same rarity.',
        minPicks: 1,
        maxPicks: 1,
        choices: getScrollChoiceItems({ ownedOnly: true }),
      };
    }
    if (scrollKey === 'scroll_branching') {
      return {
        title: 'SCROLL OF BRANCHING',
        copy: 'Choose up to 3 relics. The next reward of each selected rarity becomes that relic.',
        minPicks: 1,
        maxPicks: 3,
        choices: getScrollChoiceItems(),
      };
    }
    if (scrollKey === 'scroll_replace') {
      if (phase === 'to') {
        const fromKeys = Neo.scrollControlSelection?.fromKeys || [];
        const fromRarity = String(Neo.ITEM_DEFS?.[fromKeys[0]]?.rarity || 'knight').toLowerCase();
        return {
          title: 'SCROLL OF REPLACE',
          copy: 'Choose the relic that should appear instead.',
          minPicks: 1,
          maxPicks: 1,
          choices: getScrollChoiceItems({ rarity: fromRarity, exclude: fromKeys }),
        };
      }
      return {
        title: 'SCROLL OF REPLACE',
        copy: 'Choose up to 3 relics you do not want to see. Confirm to pick the replacement.',
        minPicks: 1,
        maxPicks: 3,
        choices: getScrollChoiceItems(),
      };
    }
    if (scrollKey === 'scroll_abundance') {
      return {
        title: 'SCROLL OF ABUNDANCE',
        copy: 'Choose 2 relics. Every two floors has a 50% chance to grant one selected relic or one random relic.',
        minPicks: 2,
        maxPicks: 2,
        choices: getScrollChoiceItems(),
      };
    }
    if (scrollKey === 'scroll_pool_weight') {
      return {
        title: 'SCROLL OF POOL WEIGHT',
        copy: 'Choose one tag. Future rewards favor that tag for the next 3 floors.',
        minPicks: 1,
        maxPicks: 1,
        choices: getScrollTagChoices(),
      };
    }
    if (scrollKey === 'scroll_ego') {
      return {
        title: 'SCROLL OF EGO',
        copy: 'Confirm to make items already in your build 10% more common for this floor.',
        minPicks: 0,
        maxPicks: 0,
        choices: [],
      };
    }
    // Unknown scroll key — surface its own name and let the player dismiss it
    // rather than silently mislabelling it as Ego.
    return {
      title: item?.name?.toUpperCase?.() || 'SCROLL OF CONTROL',
      copy: 'Confirm to use this scroll.',
      minPicks: 0,
      maxPicks: 0,
      choices: [],
    };
  }

  // The scroll-control modal elements live in Neo.ui, but if that cache was built
  // before this markup existed (or a refactor renamed a sibling), re-resolve the
  // ids by hand so the searchable grid never silently fails to render.
  function ensureScrollControlRefs() {
    const ui = Neo.ui;
    if (!ui) return false;
    const ids = ['scrollControlModal', 'scrollControlTitle', 'scrollControlCopy', 'scrollControlSearch', 'scrollControlMeta', 'scrollControlChoices', 'scrollControlCancel', 'scrollControlConfirm'];
    ids.forEach(id => { if (!ui[id]) ui[id] = document.getElementById(id); });
    return !!ui.scrollControlChoices;
  }

  function renderScrollControlPanel() {
    const state = Neo.scrollControlSelection;
    if (!state || !ensureScrollControlRefs()) return;
    const config = getScrollControlConfig(state.scrollKey, state.phase);
    state.config = config;
    const query = String(state.query || '').trim().toLowerCase();
    const choices = query ? config.choices.filter(choice => choice.search.includes(query)) : config.choices;
    if (Neo.ui.scrollControlTitle) Neo.ui.scrollControlTitle.textContent = config.title;
    if (Neo.ui.scrollControlCopy) Neo.ui.scrollControlCopy.textContent = config.copy;
    if (Neo.ui.scrollControlSearch) Neo.ui.scrollControlSearch.value = state.query || '';
    // Hide the search box for confirm-only scrolls (e.g. Ego) that have no list to filter.
    const hasChoices = config.choices.length > 0;
    const searchWrap = Neo.ui.scrollControlSearch?.closest('.scroll-control-search-wrap');
    if (searchWrap) searchWrap.classList.toggle('hidden', !hasChoices);
    if (Neo.ui.scrollControlMeta) {
      const picked = state.picks.length;
      if (config.maxPicks <= 0) {
        Neo.ui.scrollControlMeta.textContent = 'Ready to confirm';
        Neo.ui.scrollControlMeta.dataset.tone = 'ready';
      } else {
        const remaining = Math.max(0, config.minPicks - picked);
        Neo.ui.scrollControlMeta.textContent = `${picked} / ${config.maxPicks} selected`;
        Neo.ui.scrollControlMeta.dataset.tone = remaining === 0 ? 'ready' : 'pending';
      }
    }
    const ownedItems = Neo.player?.items || {};
    Neo.ui.scrollControlChoices.innerHTML = choices.map((choice, index) => {
      const selected = state.picks.includes(choice.key);
      const pickOrder = selected ? state.picks.indexOf(choice.key) + 1 : 0;
      const color = choice.type === 'item' ? Neo.getRarityNameColor?.(choice.rarity) || choice.color : choice.color;
      const icon = choice.type === 'item'
        ? `<canvas class="scroll-control-choice__icon" data-item-icon="${Neo.escapeHtml(choice.key)}" width="48" height="48"></canvas>`
        : `<span class="scroll-control-choice__tag" aria-hidden="true">#</span>`;
      const owned = Math.max(0, Math.floor(Number(ownedItems[choice.key] || 0)));
      const ownedBadge = owned > 0 ? `<span class="scroll-control-choice__owned">×${owned}</span>` : '';
      // When more than one pick is allowed, show the pick order so multi-select reads clearly.
      const orderBadge = (selected && config.maxPicks > 1)
        ? `<span class="scroll-control-choice__order">${pickOrder}</span>`
        : (selected ? '<span class="scroll-control-choice__order scroll-control-choice__order--check">✓</span>' : '');
      const eyebrow = choice.type === 'tag' ? 'Tag' : (choice.rarity || 'relic');
      return `<button class="scroll-control-choice${selected ? ' is-selected' : ''}" type="button" role="option" aria-selected="${selected}" data-scroll-choice="${Neo.escapeHtml(choice.key)}" style="--scroll-choice-color:${Neo.escapeHtml(color)};animation-delay:${Math.min(index, 12) * 18}ms">
        ${orderBadge}
        <span class="scroll-control-choice__iconwrap">${icon}${ownedBadge}</span>
        <span class="scroll-control-choice__body">
          <span class="scroll-control-choice__eyebrow">${Neo.escapeHtml(eyebrow)}</span>
          <span class="scroll-control-choice__name">${Neo.escapeHtml(choice.name)}</span>
          <span class="scroll-control-choice__desc">${Neo.escapeHtml(choice.description || '')}</span>
        </span>
      </button>`;
    }).join('') || (config.choices.length === 0
      ? '<div class="scroll-control-empty"><span class="scroll-control-empty__glyph">∅</span><h4>Nothing to choose</h4><p>This scroll has no valid targets right now. Cancel to discard it.</p></div>'
      : '<div class="scroll-control-empty"><span class="scroll-control-empty__glyph">🔍</span><h4>No matches</h4><p>Clear the search to see available choices.</p></div>');
    Neo.drawItemIconCanvases?.(Neo.ui.scrollControlChoices, 'data-item-icon');
    if (Neo.ui.scrollControlConfirm) {
      const canConfirm = state.picks.length >= config.minPicks && state.picks.length <= config.maxPicks;
      Neo.ui.scrollControlConfirm.disabled = !canConfirm;
      if (state.scrollKey === 'scroll_replace' && state.phase !== 'to') {
        Neo.ui.scrollControlConfirm.textContent = canConfirm ? 'CHOOSE REPLACEMENT' : 'PICK UNWANTED RELICS';
      } else {
        Neo.ui.scrollControlConfirm.textContent = canConfirm ? 'CONFIRM' : `PICK ${config.minPicks - state.picks.length} MORE`;
      }
    }
  }

  function isScrollControlItem(itemKey) {
    return SCROLL_KEYS.has(itemKey);
  }

  // Queue `count` scroll selections owed by a pickup/purchase, then try to present
  // the first one now (defers via requestPanelItemSelection if an overlay is open).
  function enqueueScrollSelection(scrollKey, count = 1) {
    if (!Neo.player || !SCROLL_KEYS.has(scrollKey)) return false;
    if (!Array.isArray(Neo.player.scrollPendingQueue)) Neo.player.scrollPendingQueue = [];
    const copies = Math.max(1, Math.floor(Number(count) || 1));
    for (let index = 0; index < copies; index += 1) Neo.player.scrollPendingQueue.push(scrollKey);
    Neo.scheduleRunSave?.();
    if (!requestPanelItemSelection()) notifyPanelItemDeferred(scrollKey);
    return true;
  }

  // Actually open the scroll control modal for `scrollKey`. Callers (the dispatcher)
  // are responsible for the gameState / overlay guards.
  function beginScrollControlSelection(scrollKey) {
    if (!Neo.player || !SCROLL_KEYS.has(scrollKey)) return false;
    if (Neo.getItemCount(scrollKey) <= 0) {
      // Owed a prompt but the scroll is gone (e.g. rerolled away) — drop the entry.
      dequeueScrollSelection(scrollKey);
      return false;
    }
    Neo.scrollControlSelection = { scrollKey, phase: 'main', picks: [], fromKeys: [], query: '' };
    Neo.setScrollControlModalOpen?.(true);
    renderScrollControlPanel();
    return true;
  }

  // Remove a single queued entry for scrollKey (the one being resolved).
  function dequeueScrollSelection(scrollKey) {
    const queue = Neo.player?.scrollPendingQueue;
    if (!Array.isArray(queue)) return;
    const idx = queue.indexOf(scrollKey);
    if (idx >= 0) queue.splice(idx, 1);
  }

  function updateScrollControlSearch(query = '') {
    if (!Neo.scrollControlSelection) return;
    Neo.scrollControlSelection.query = String(query || '');
    renderScrollControlPanel();
  }

  function handleScrollControlChoiceClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-scroll-choice]') : null;
    const choiceKey = target?.dataset?.scrollChoice || '';
    const state = Neo.scrollControlSelection;
    if (!state || !choiceKey) return;
    const config = getScrollControlConfig(state.scrollKey, state.phase);
    const picks = state.picks;
    const existing = picks.indexOf(choiceKey);
    if (existing >= 0) picks.splice(existing, 1);
    else {
      if (picks.length >= config.maxPicks) picks.shift();
      picks.push(choiceKey);
    }
    renderScrollControlPanel();
  }

  function consumeScroll(scrollKey) {
    if (!Neo.player?.items || Number(Neo.player.items[scrollKey] || 0) <= 0) return false;
    Neo.player.items[scrollKey] = Math.max(0, Number(Neo.player.items[scrollKey] || 0) - 1);
    if (Neo.player.items[scrollKey] <= 0) delete Neo.player.items[scrollKey];
    Neo.syncEquipmentSlotsFromInventory?.();
    return true;
  }

  function getSameRarityRandomItem(sourceKey, random) {
    const rarity = String(Neo.ITEM_DEFS?.[sourceKey]?.rarity || 'knight').toLowerCase();
    const pool = (Neo.ITEM_KEYS || []).filter(key => !SCROLL_KEYS.has(key) && key !== sourceKey && String(Neo.ITEM_DEFS?.[key]?.rarity || '').toLowerCase() === rarity);
    const pickPool = pool.length ? pool : (Neo.ITEM_KEYS || []).filter(key => !SCROLL_KEYS.has(key) && key !== sourceKey);
    return pickPool[Math.floor((typeof random === 'function' ? random() : Neo.rng()) * pickPool.length)] || 'neo_knife';
  }

  function confirmScrollControlSelection() {
    const state = Neo.scrollControlSelection;
    if (!state || !Neo.player) return;
    const config = getScrollControlConfig(state.scrollKey, state.phase);
    if (state.picks.length < config.minPicks) return;
    if (state.scrollKey === 'scroll_replace' && state.phase !== 'to') {
      state.fromKeys = state.picks.slice(0, 3);
      state.phase = 'to';
      state.picks = [];
      state.query = '';
      renderScrollControlPanel();
      return;
    }
    if (!consumeScroll(state.scrollKey)) return;
    Neo.player.scrollUseSerial = Math.max(0, Math.floor(Number(Neo.player.scrollUseSerial || 0))) + 1;
    const selectedScope = [...state.fromKeys, ...state.picks].join(',');
    const random = Neo.createScopedRandom?.(`scroll:${state.scrollKey}:use:${Neo.player.scrollUseSerial}:floor:${Neo.floor}:choices:${selectedScope}`) || Neo.rng;
    if (state.scrollKey === 'scroll_reroll') {
      const oldKey = state.picks[0];
      const newKey = getSameRarityRandomItem(oldKey, random);
      Neo.player.items[oldKey] = Math.max(0, Number(Neo.player.items[oldKey] || 0) - 1);
      if (Neo.player.items[oldKey] <= 0) delete Neo.player.items[oldKey];
      Neo.collectItem(newKey);
    } else if (state.scrollKey === 'scroll_branching') {
      Neo.player.scrollBranchingTargets = { ...(Neo.player.scrollBranchingTargets || {}) };
      state.picks.forEach(key => {
        const rarity = String(Neo.ITEM_DEFS?.[key]?.rarity || 'knight').toLowerCase();
        Neo.player.scrollBranchingTargets[rarity] = key;
      });
    } else if (state.scrollKey === 'scroll_replace') {
      const toKey = state.picks[0];
      Neo.player.scrollReplaceMap = { ...(Neo.player.scrollReplaceMap || {}) };
      state.fromKeys.forEach(fromKey => { Neo.player.scrollReplaceMap[fromKey] = toKey; });
    } else if (state.scrollKey === 'scroll_abundance') {
      Neo.player.scrollAbundance = { items: state.picks.slice(0, 2), nextCheckFloor: Neo.floor + 2, expiresFloor: Neo.floor + 8 };
    } else if (state.scrollKey === 'scroll_pool_weight') {
      const buffs = Array.isArray(Neo.player.scrollPoolWeights) ? Neo.player.scrollPoolWeights : [];
      buffs.push({ tag: state.picks[0], expiresFloor: Neo.floor + 3 });
      Neo.player.scrollPoolWeights = buffs.slice(-4);
    } else if (state.scrollKey === 'scroll_ego') {
      Neo.player.scrollEgoFloor = Neo.floor;
    }
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 0.9, text: 'SCROLL SET', c: '#d7f6ff' });
    dequeueScrollSelection(state.scrollKey);
    Neo.scrollControlSelection = null;
    Neo.setScrollControlModalOpen?.(false);
    Neo.markInventoryPanelDirty?.();
    Neo.renderInventoryPanel?.();
    Neo.updateHud?.();
    Neo.scheduleRunSave?.();
    // Chain into the next owed scroll/paw/battery now that the modal is closed.
    requestPanelItemSelection();
  }

  function cancelScrollControlSelection() {
    const state = Neo.scrollControlSelection;
    Neo.scrollControlSelection = null;
    Neo.setScrollControlModalOpen?.(false);
    // Scrolls are spent on acquisition: dismissing the popup still consumes the
    // scroll (no effect applied) and clears its queued prompt — no take-backs.
    if (state?.scrollKey) {
      consumeScroll(state.scrollKey);
      dequeueScrollSelection(state.scrollKey);
      Neo.spawnParticle?.({ x: Neo.player?.x || 0, y: (Neo.player?.y || 0) - 28, life: 0.8, text: 'SCROLL DISCARDED', c: '#9aa6b2' });
      Neo.markInventoryPanelDirty?.();
      Neo.renderInventoryPanel?.();
      Neo.updateHud?.();
      Neo.scheduleRunSave?.();
    }
    // Present the next owed selection (if any).
    requestPanelItemSelection();
  }

  // ── Voucher redemption ────────────────────────────────────────────────────

  function getVoucherCount() {
    return Math.max(0, Math.floor(Number(Neo.player?.items?.[Neo.VOUCHER_KEY] || 0)));
  }

  // Keys that can never be granted as a voucher reward (the voucher itself and
  // the scroll-of-control utility relics, which require manual targeting).
  function getVoucherExcludedKeys() {
    return new Set([Neo.VOUCHER_KEY, ...(Neo.SCROLL_OF_CONTROL_KEYS || [])]);
  }

  function getVoucherRarityPool(rarity) {
    const targetRarity = String(rarity || '').toLowerCase();
    const excluded = getVoucherExcludedKeys();
    return (Neo.ITEM_KEYS || []).filter(key => {
      if (excluded.has(key)) return false;
      const item = Neo.ITEM_DEFS?.[key];
      if (!item) return false;
      return String(item.rarity || item.category || 'knight').toLowerCase() === targetRarity;
    });
  }

  function grantRandomItemOfRarity(rarity, random) {
    const pool = getVoucherRarityPool(rarity);
    if (!pool.length) return '';
    const roll = typeof random === 'function' ? random() : Neo.rng();
    const key = pool[Math.floor(roll * pool.length)] || pool[0];
    Neo.collectItem(key);
    return key;
  }

  function renderVoucherModal() {
    if (!Neo.ui.voucherChoices) return;
    const count = getVoucherCount();
    if (Neo.ui.voucherMeta) {
      Neo.ui.voucherMeta.textContent = count === 1 ? '1 voucher held' : `${count} vouchers held`;
    }
    const colors = Neo.VOUCHER_COLORS || [];
    Neo.ui.voucherChoices.innerHTML = colors.map(color => {
      const poolSize = getVoucherRarityPool(color.rarity).length;
      const disabled = poolSize <= 0;
      return `<button class="wizard-paw-choice voucher-choice${disabled ? ' is-disabled' : ''}" type="button" data-voucher-color="${Neo.escapeHtml(color.id)}"${disabled ? ' disabled' : ''} style="--voucher-color:${Neo.escapeHtml(color.color)}">
        <span class="wizard-paw-choice__eyebrow">${Neo.escapeHtml(color.label)}</span>
        <span class="voucher-choice__swatch" style="background:${Neo.escapeHtml(color.color)}"></span>
        <p>${disabled ? 'No relics available.' : `Random ${Neo.escapeHtml(color.label.toLowerCase())} relic.`}</p>
      </button>`;
    }).join('');
  }

  function openVoucherRedeem() {
    if (!Neo.player) return false;
    if (Neo.currentRoom?.type !== 'shop') return false;
    if (Neo.isChallengeActive?.('no_items')) {
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
      return false;
    }
    if (getVoucherCount() <= 0) return false;
    Neo.voucherRedeemOpen = true;
    Neo.setVoucherModalOpen?.(true);
    renderVoucherModal();
    return true;
  }

  function cancelVoucherRedeem() {
    Neo.voucherRedeemOpen = false;
    Neo.setVoucherModalOpen?.(false);
  }

  function handleVoucherChoiceClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-voucher-color]') : null;
    const colorId = target?.dataset?.voucherColor || '';
    if (!colorId || target?.disabled) return;
    redeemVoucherColor(colorId);
  }

  function redeemVoucherColor(colorId) {
    if (!Neo.player) return false;
    if (Neo.isChallengeActive?.('no_items')) return false;
    if (getVoucherCount() <= 0) return false;
    const color = (Neo.VOUCHER_COLORS || []).find(entry => entry.id === colorId);
    if (!color) return false;
    if (getVoucherRarityPool(color.rarity).length <= 0) return false;
    // Consume one voucher.
    Neo.player.items[Neo.VOUCHER_KEY] = Math.max(0, getVoucherCount() - 1);
    if (Neo.player.items[Neo.VOUCHER_KEY] <= 0) delete Neo.player.items[Neo.VOUCHER_KEY];
    Neo.syncEquipmentSlotsFromInventory?.();
    Neo.player.voucherUseSerial = Math.max(0, Math.floor(Number(Neo.player.voucherUseSerial || 0))) + 1;
    const random = Neo.createScopedRandom?.(`voucher:${color.id}:use:${Neo.player.voucherUseSerial}:floor:${Neo.floor}`) || Neo.rng;
    const grantedKey = grantRandomItemOfRarity(color.rarity, random);
    if (grantedKey) {
      const grantedName = Neo.itemRegistry?.get?.(grantedKey)?.name || Neo.ITEM_DEFS?.[grantedKey]?.name || grantedKey;
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.9, text: `VOUCHER: ${grantedName}`, c: color.color });
      Neo.playSfx?.('item_collect');
      window.achievementEvents?.emit?.('shop:bought');
    }
    // Keep the modal open if more vouchers remain, otherwise close it.
    if (getVoucherCount() > 0) renderVoucherModal();
    else cancelVoucherRedeem();
    Neo.markShopPanelDirty?.();
    Neo.markInventoryPanelDirty?.();
    Neo.renderShopPanel?.();
    Neo.renderInventoryPanel?.();
    Neo.refreshShopVoucherBanner?.();
    Neo.scheduleRunSave?.();
    Neo.syncCurrentRoomState?.();
    Neo.updateHud?.();
    return true;
  }

  function refreshShopVoucherBanner() {
    const banner = Neo.ui?.shopVoucherBanner;
    if (!banner) return;
    const show = Neo.currentRoom?.type === 'shop'
      && getVoucherCount() > 0
      && !Neo.isChallengeActive?.('no_items');
    banner.classList.toggle('hidden', !show);
    banner.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show && Neo.ui.shopVoucherBannerSub) {
      const count = getVoucherCount();
      Neo.ui.shopVoucherBannerSub.textContent = count > 1
        ? `${count} vouchers ready — redeem for a relic of your chosen colour.`
        : 'Redeem for a relic of your chosen colour.';
    }
  }

  function applyScrollAbundanceForFloor() {
    const state = Neo.player?.scrollAbundance;
    if (!state || Neo.floor < Number(state.nextCheckFloor || 999) || Neo.floor > Number(state.expiresFloor || 0)) return;
    const random = Neo.createScopedRandom?.(`scroll:abundance:${Neo.baseSeedStr || ''}:${Neo.floor}`) || Neo.rng;
    state.nextCheckFloor = Neo.floor + 2;
    if (random() >= 0.5) return;
    const selected = Array.isArray(state.items) ? state.items.filter(key => Neo.ITEM_DEFS?.[key]) : [];
    const randomPool = (Neo.ITEM_KEYS || []).filter(key => Neo.ITEM_DEFS?.[key] && !SCROLL_KEYS.has(key));
    const offerPool = [
      ...selected.slice(0, 2),
      randomPool[Math.floor(random() * randomPool.length)],
      randomPool[Math.floor(random() * randomPool.length)],
    ].filter(Boolean);
    const key = offerPool[Math.floor(random() * offerPool.length)];
    if (key) {
      Neo.collectItem(key);
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 42, life: 1.0, text: 'ABUNDANCE', c: '#fff2a8' });
    }
    if (Neo.floor >= Number(state.expiresFloor || 0)) delete Neo.player.scrollAbundance;
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
  // Ricocete bounce roll: 1 guaranteed bounce if any stack is owned, then a 50%
  // chance per stack to add another. Rolled per-projectile so shots vary.
  function rollRicoceteBounces(stacks) {
    const n = Math.max(0, Math.floor(Number(stacks || 0)));
    if (n <= 0) return 0;
    let bounces = 1;
    for (let i = 0; i < n; i += 1) {
      if (Neo.nextRandom('encounter') < 0.5) bounces += 1;
    }
    return bounces;
  }
  Neo.rollRicoceteBounces = rollRicoceteBounces;
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
  Neo.isScrollControlItem = isScrollControlItem;
  Neo.enqueueScrollSelection = enqueueScrollSelection;
  Neo.renderScrollControlPanel = renderScrollControlPanel;
  Neo.updateScrollControlSearch = updateScrollControlSearch;
  Neo.handleScrollControlChoiceClick = handleScrollControlChoiceClick;
  Neo.confirmScrollControlSelection = confirmScrollControlSelection;
  Neo.cancelScrollControlSelection = cancelScrollControlSelection;
  Neo.getVoucherCount = getVoucherCount;
  Neo.grantRandomItemOfRarity = grantRandomItemOfRarity;
  Neo.openVoucherRedeem = openVoucherRedeem;
  Neo.cancelVoucherRedeem = cancelVoucherRedeem;
  Neo.handleVoucherChoiceClick = handleVoucherChoiceClick;
  Neo.redeemVoucherColor = redeemVoucherColor;
  Neo.renderVoucherModal = renderVoucherModal;
  Neo.refreshShopVoucherBanner = refreshShopVoucherBanner;
  Neo.applyScrollAbundanceForFloor = applyScrollAbundanceForFloor;
  Neo.openExtraBatterySelection = openExtraBatterySelection;
  Neo.grantExtraBatteryToMove = grantExtraBatteryToMove;
  Neo.consumeCharge = consumeCharge;
  Neo.refreshFloorChargeStates = refreshFloorChargeStates;
