// player.js — Player data migration, stats, abilities, charge.

// Moves renamed across versions: { oldSavedKey: currentKey }. Applied during
// migration so saves referencing the old key keep the move.
const RENAMED_MOVE_KEYS = {
  fangs_of_death: 'random_pounce',
};

export function countOwnedToolStacks(items = null, itemDefs = null) {
  const inventory = items || {};
  const definitions = itemDefs || {};
  return Object.keys(definitions).reduce((total, key) => {
    if (!definitions[key]?.tool || definitions[key]?.voucher) return total;
    return total + Math.max(0, Math.floor(Number(inventory[key]) || 0));
  }, 0);
}

export function getArtificerLevelGains(stacks = 0) {
  const active = Math.max(0, Number(stacks) || 0) > 0;
  return {
    maxHp: active ? 16 : 15,
    attackPower: active ? 4 : 3,
    attackSpeed: active ? 0.02 : 0.01,
  };
}

export function getCloakFlatDamageReduction(stacks = 0, ownedToolStacks = 0) {
  const cloakStacks = Math.max(0, Number(stacks) || 0);
  const toolStacks = Math.max(0, Number(ownedToolStacks) || 0);
  if (cloakStacks <= 0) return 0;
  return cloakStacks * 100 + toolStacks;
}

export function getRichMansBluesCrystalReward(floor = 1, stacks = 1) {
  const floorCount = Math.max(1, Math.floor(Number(floor) || 1));
  const itemStacks = Math.max(0, Math.floor(Number(stacks) || 0));
  return (25 + floorCount * 2) * itemStacks;
}

export function migrateLegacyVoucherInventory(items) {
    if (!items || typeof items !== 'object') return items;
    const legacyCount = Math.max(0, Number(items.voucher || 0));
    if (legacyCount > 0) {
      items.voucher_yellow = Number(items.voucher_yellow || 0) + legacyCount;
    }
    delete items.voucher;
    return items;
  }

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
    // Bandaid and Tough Skin were merged into Tough Bandaid; fold any saved copies
    // of either old relic into the combined item so existing runs keep their stacks.
    if (playerData.items && typeof playerData.items === 'object') {
      const legacyToughBandaid = Number(playerData.items.bandaid || 0) + Number(playerData.items.tough_skin || 0);
      if (legacyToughBandaid > 0) {
        playerData.items.tough_bandaid = Number(playerData.items.tough_bandaid || 0) + legacyToughBandaid;
      }
      delete playerData.items.bandaid;
      delete playerData.items.tough_skin;

      // Double Dose was merged into Potion Master. Preserve both items' saved
      // stacks because each Potion Master stack now grants both effects.
      const legacyDoubleDose = Math.max(0, Number(playerData.items.double_dose || 0));
      if (legacyDoubleDose > 0) {
        playerData.items.drink_master = Number(playerData.items.drink_master || 0) + legacyDoubleDose;
      }
      delete playerData.items.double_dose;
    }
    // The former generic voucher could claim any rarity, so preserve its full
    // value by migrating each saved copy to the highest-class Yellow voucher.
    migrateLegacyVoucherInventory(playerData.items);
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
    playerData.lastSecretVendorRewardKey = Neo.ITEM_DEFS?.[playerData.lastSecretVendorRewardKey]
      ? String(playerData.lastSecretVendorRewardKey)
      : '';
    // Scrolls picked up/bought open their selection popup on acquisition. Any that
    // couldn't open immediately (shop/cinematic) wait here until presentable.
    playerData.scrollPendingQueue = Array.isArray(playerData.scrollPendingQueue)
      ? playerData.scrollPendingQueue.filter(key => SCROLL_KEYS.has(key))
      : [];
    const normalizedBranchingTargets = {};
    if (playerData.scrollBranchingTargets && typeof playerData.scrollBranchingTargets === 'object') {
      Object.entries(playerData.scrollBranchingTargets).forEach(([rarity, key]) => {
        const cleanRarity = String(rarity || '').toLowerCase();
        if (Neo.ITEM_DEFS?.[key] && String(Neo.ITEM_DEFS[key]?.rarity || '').toLowerCase() === cleanRarity) {
          normalizedBranchingTargets[cleanRarity] = key;
        }
      });
    }
    playerData.scrollBranchingTargets = normalizedBranchingTargets;
    const normalizedReplaceMap = {};
    if (playerData.scrollReplaceMap && typeof playerData.scrollReplaceMap === 'object') {
      Object.entries(playerData.scrollReplaceMap).forEach(([fromKey, toKey]) => {
        const fromRarity = String(Neo.ITEM_DEFS?.[fromKey]?.rarity || '').toLowerCase();
        const toRarity = String(Neo.ITEM_DEFS?.[toKey]?.rarity || '').toLowerCase();
        if (fromRarity && fromRarity === toRarity) normalizedReplaceMap[fromKey] = toKey;
      });
    }
    playerData.scrollReplaceMap = normalizedReplaceMap;
    playerData.scrollPoolWeights = Array.isArray(playerData.scrollPoolWeights)
      ? playerData.scrollPoolWeights
        .filter(buff => buff && Neo.ITEM_DEFS?.[buff.itemKey] && Number(buff.expiresFloor || 0) > 0)
        .map(buff => ({ itemKey: String(buff.itemKey), expiresFloor: Math.max(1, Math.floor(Number(buff.expiresFloor || 1))) }))
      : [];
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
    playerData.statusResistTime = Number(playerData.statusResistTime || 0);
    playerData.potionRegenTime = Number(playerData.potionRegenTime || 0);
    playerData.potionRegenAccum = Number(playerData.potionRegenAccum || 0);
    playerData.overhealBarrier = Math.max(0, Number(playerData.overhealBarrier || 0));
    playerData.overhealBarrierMax = playerData.overhealBarrier > 0
      ? Math.max(playerData.overhealBarrier, Number(playerData.overhealBarrierMax) || 0)
      : 0;
    playerData.overhealBarrierColor = String(playerData.overhealBarrierColor || '');
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
    if (!playerData.weaponChargeOverrides || typeof playerData.weaponChargeOverrides !== 'object') {
      playerData.weaponChargeOverrides = {};
    }
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

// Per-character, per-slot kit options selectable on the pick-character screen.
// The FIRST entry in each list is the character's default for that slot; the
// rest are alternatives the player can swap in before a run. Slots not listed
// here have no alternatives (only the base default applies).
export const KIT_ALTERNATIVES = {
  thorn_knight: {
    laser: ['blood_beam', 'thorn_blood_beams'],
    dash: ['dash', 'knight_slash_dash'],
  },
  metao: {
    laser: ['power_disks', 'wizard_lazer'],
    smash: ['chaos_burst', 'potion_bath'],
  },
  gelleh: {
    smash: ['healing_zone', 'holy_turrets', 'excalibur_strike'],
  },
  mooggy: {
    laser: ['nail_shot', 'mooggy_blood_beam'],
    smash: ['random_pounce', 'mooggy_hairball'],
  },
};

// The base (first-option) default kit per character, before any alt-kit choices.
function getBaseMovesForCharacter(characterKey) {
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

// The player's saved alt-kit selection for a character/slot, validated against
// KIT_ALTERNATIVES. Falls back to the slot's default when unset or invalid.
export function getKitChoice(characterKey, slot) {
    const options = KIT_ALTERNATIVES[characterKey]?.[slot];
    if (!Array.isArray(options) || options.length === 0) return null;
    const saved = Neo.metaProgress?.characterKitChoices?.[characterKey]?.[slot];
    return options.includes(saved) ? saved : options[0];
  }

export function setKitChoice(characterKey, slot, moveKey) {
    const options = KIT_ALTERNATIVES[characterKey]?.[slot];
    if (!Array.isArray(options) || !options.includes(moveKey)) return;
    if (!Neo.metaProgress) return;
    if (!Neo.metaProgress.characterKitChoices || typeof Neo.metaProgress.characterKitChoices !== 'object') {
      Neo.metaProgress.characterKitChoices = {};
    }
    if (!Neo.metaProgress.characterKitChoices[characterKey] || typeof Neo.metaProgress.characterKitChoices[characterKey] !== 'object') {
      Neo.metaProgress.characterKitChoices[characterKey] = {};
    }
    Neo.metaProgress.characterKitChoices[characterKey][slot] = moveKey;
    Neo.persistMetaSoon?.();
  }

export function getDefaultMovesForCharacter(characterKey) {
    const moves = getBaseMovesForCharacter(characterKey);
    // Overlay any alt-kit options the player picked on the character-select screen.
    const altSlots = KIT_ALTERNATIVES[characterKey];
    if (altSlots) {
      Object.keys(altSlots).forEach(slot => {
        const choice = getKitChoice(characterKey, slot);
        if (choice) moves[slot] = choice;
      });
    }
    return moves;
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
    // El Barto's Cape conceals the player for its full active duration, matching the
    // visual effect (graffiti, HUD timer).
    const capeEffect = playerData.equipmentEffects?.el_bartos_cape;
    if (capeEffect && Number(capeEffect.time || 0) > 0) return true;
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
    if (!Neo.godItemKeysCache) {
      Neo.godItemKeysCache = Neo.ITEM_KEYS.filter(key => (
        Neo.isGodTier?.(Neo.ITEM_DEFS[key]?.rarity) && !Neo.ITEM_DEFS[key]?.voucher
      ));
    }

    const neoKnife = getItemCount('neo_knife');
  const toothOfThorn = getItemCount('tooth_of_thorn');
    const toughBandaid = getItemCount('tough_bandaid');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const copycatCharm = getItemCount('copycat_charm');
    const attackServo = getItemCount('attack_servo');
  const enemyMagnet = getItemCount('enemy_magnet');
    const robotArm = getItemCount('robot_arm');
    const scholarSeal = getItemCount('scholar_seal');
    const scholarCap = getItemCount('scholar_cap');
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
    const artificerCharger = getItemCount('artificer_charger');
    const nakedKingCloak = getItemCount('cloak_of_naked_king');
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
    const ownedToolStacks = countOwnedToolStacks(Neo.player?.items, Neo.ITEM_DEFS);
    // Count distinct tool relics the player owns (items flagged `tool: true`),
    // so Procy Pickle's poison-on-tool-use chance scales with how tool-heavy the
    // build is. Procy Pickle itself isn't a tool, so it never counts toward this.
    const ownedToolCount = procyPickle > 0
      ? Neo.ITEM_KEYS.reduce((total, key) => (
          getItemCount(key) > 0 && Neo.ITEM_DEFS[key]?.tool && !Neo.ITEM_DEFS[key]?.voucher
            ? total + 1
            : total
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
    const baseBleedChance = neoKnife * 0.05 + toughBandaid * 0.02;
    const tagCounts = getItemTagCounts();
    const healingTagStacks = Number(tagCounts.heal || 0) + Number(tagCounts.healing || 0);
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
    // Crit roll-back: let chance climb past the old 0.95 cap, then convert every
    // crossing of 100% into +50% crit damage and a roll-back to 75% (see
    // applyCritRollback). The base multiplier is built first, then the roll-back
    // scales it; the rolled-back chance is clamped to [0.01, 1].
    critChance = Math.max(0.01, critChance);
    // Build the base crit multiplier from the (pre-rollback) chance, then run the
    // roll-back to fold any chance over 100% into extra crit damage.
    const baseCritMultiplier = 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6) + keenEyeCritDamageBonus;
    const critRollback = Neo.applyCritRollback(critChance, baseCritMultiplier);
    critChance = Neo.clamp(critRollback.critChance, 0.01, 1);
    const critMultiplier = critRollback.critMultiplier;
    // Pendant of Kronos: +1% base damage per god/yellow item owned (every stack
    // counts every god item), plus an extra +2% damage to bosses per stack.
    const kronosDamageMultiplier = 1 + pendantOfKronos * godItemStacks * 0.01;
    const kronosBossDamageMultiplier = 1 + pendantOfKronos * 0.02;
    const standardDamageReduction = Neo.clamp(
      toughBandaid * 0.005 + shieldOfAegis * 0.2 + princesGlassesDefense,
      0,
      0.85,
    );
    const damageReduction = standardDamageReduction;
    const flatDamageReduction = getCloakFlatDamageReduction(nakedKingCloak, ownedToolStacks);
    const xpProgress = Neo.clamp((Neo.player?.xpToNext || 0) > 0 ? (Neo.player?.xp || 0) / Neo.player.xpToNext : 0, 0, 1);
    const characterDef = Neo.getCharacterDef?.() || {};
    Neo.itemStatsCacheValue = {
      bleedChance: baseBleedChance,
      weaponBleedChance: weaponBleedBonus,
      displayedBleedChance: baseBleedChance + weaponBleedBonus,
      weaponCritChance: weaponCritBonus,
      displayedCritChance: critChance + weaponCritBonus,
      // Tooth of Thorn ramps: 2.8% per stack plus an extra 2% × stacks per stack,
      // so investment compounds (mirrors Enemy Magnet's homing ramp).
      drainChance: toothOfThorn * 0.028 + toothOfThorn * toothOfThorn * 0.02,
      bleedResistance: Neo.clamp(toughBandaid * 0.1, 0, 0.8),
      // Always-on base fire-damage reduction: the player takes ~50% less fire
      // DoT. Applied in the player fire tick (tickPlayerStatus 'fire').
      fireResistance: 0.5,
      // Tough Bandaid also makes bleed wear off faster: each stack speeds the bleed
      // timer decay by 20% (so bleeds tick fewer times), capped at 3x faster.
      bleedDurationDecayMultiplier: Neo.clamp(1 + toughBandaid * 0.2, 1, 3),
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
      potionDoubleChance: Neo.clamp(drinkMaster * 0.5, 0, 1),
      itemDuplicateChance: Neo.clamp(copycatCharm * 0.3, 0, 1),
      critChance,
      critMultiplier,
      kronosDamageMultiplier,
      kronosBossDamageMultiplier,
      attackSpeedMultiplier: 1 + attackServo * 0.12 + chronoSpringBonus,
      hasRobotArm: robotArm > 0,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      laserWeightMultiplier: Math.max(0, 1 - turtleShell * 0.01),
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      levelEdgeDamageMultiplier: 1 + scholarCap * xpProgress * 0.45,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: (1 + explosiveJelly * 0.2)
        * Number(characterDef.aoeRadiusMultiplier || 1)
        * (artificerCharger > 0 ? 1.267 : 1),
      aoeDamageMultiplier: Number(characterDef.aoeDamageMultiplier || 1),
      playerSpriteScale: artificerCharger > 0 ? 1.267 : 1,
      beamWidthMultiplier: artificerCharger > 0 ? 1.05 : 1,
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
      flatDamageReduction,
      negativeStatusMultiplier: 1 + nakedKingCloak * 0.2,
      ownedToolStacks,
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
        Neo.player.overhealBarrierMax = Math.max(Number(Neo.player.overhealBarrierMax || 0), barrierCap);
        Neo.player.overhealBarrierColor = Neo.player.overhealBarrierColor || '#9cefff';
        Neo.player.overhealBarrierAge = 0;
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

export function getPendingUiItemCount(itemKey, playerData = Neo.player) {
    if (!playerData || !itemKey) return 0;
    const item = Neo.itemRegistry?.get?.(itemKey) || Neo.ITEM_DEFS?.[itemKey] || Neo.SCROLL_DEFS?.[itemKey];
    if (item?.opensUi === 'wizardPaw') {
      return Math.max(0, Math.floor(Number(playerData.wizardPawPendingCount || 0)));
    }
    if (item?.opensUi === 'extraBattery') {
      return Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0)));
    }
    if (item?.opensUi === 'scrollControl') {
      return Array.isArray(playerData.scrollPendingQueue)
        ? playerData.scrollPendingQueue.filter(key => key === itemKey).length
        : 0;
    }
    return 0;
  }

export function getPendingUiItems(playerData = Neo.player) {
    if (!playerData) return [];
    const keys = new Set(['wizards_paw', 'extra_battery', ...(playerData.scrollPendingQueue || [])]);
    return [...keys].map(key => {
      const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS?.[key] || Neo.SCROLL_DEFS?.[key];
      const count = getPendingUiItemCount(key, playerData);
      return item?.opensUi && count > 0 ? { key, item, count } : null;
    }).filter(Boolean);
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
    if (!options.itemKey && Number(Neo.suppressPanelItemSelectionUntil || 0) > Date.now()) return false;
    // Don't fight a cinematic, transition, death, or another blocking overlay.
    if (Neo.gameState !== 'play') return false;
    // The paw modal is itself a blocking overlay; if it's already up, wait for confirm.
    if (Neo.isWizardPawOpen?.()) return false;
    if (Neo.isOverlayBlockingInput?.()) return false;
    const preferredItemKey = String(options.itemKey || '');
    const preferredItem = preferredItemKey
      ? (Neo.itemRegistry?.get?.(preferredItemKey) || Neo.ITEM_DEFS?.[preferredItemKey] || Neo.SCROLL_DEFS?.[preferredItemKey])
      : null;
    const preferredUi = getPendingUiItemCount(preferredItemKey, player) > 0 ? preferredItem?.opensUi : '';
    // Explicit card clicks open that card. Automatic dispatch keeps the normal
    // paw -> scroll -> battery priority.
    if (pawPending > 0 && (!preferredUi || preferredUi === 'wizardPaw')) {
      beginWizardPawModal();
      return true;
    }
    // Scrolls next: each owed scroll opens its own control modal.
    if (scrollPending && (!preferredUi || preferredUi === 'scrollControl')) {
      const scrollKey = preferredUi === 'scrollControl' ? preferredItemKey : player.scrollPendingQueue[0];
      beginScrollControlSelection(scrollKey);
      return true;
    }
    // Closing another panel must not instantly surface the battery modal (that
    // would undo the close the player just asked for); those callers pass
    // { suppressBatteryOpen: true } and the choice stays owed on the HUD chip.
    if (options.suppressBatteryOpen) return false;
    if (batteryPending > 0 && (!preferredUi || preferredUi === 'extraBattery')) {
      beginExtraBatteryModal();
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
      .filter(key => (
        Neo.ITEM_DEFS?.[key]
        && Neo.ITEM_DEFS[key].rarity !== 'blue'
        && !excluded.has(key)
        && !SCROLL_KEYS.has(key)
      ))
      .filter(key => !ownedOnly || Number(owned[key] || 0) > 0)
      .filter(key => !rarity || String(Neo.ITEM_DEFS[key]?.rarity || '').toLowerCase() === rarity)
      .map(key => {
        const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS[key];
        const tags = Array.from(item?.tags || []);
        return {
          key,
          type: 'item',
          name: item?.name || Neo.titleCase?.(key) || key,
          description: item?.description || '',
          rarity: item?.rarity || item?.category || 'knight',
          color: item?.color || Neo.getRarityNameColor?.(item?.rarity) || '#d8e9ff',
          search: `${item?.name || key} ${item?.description || ''} ${item?.rarity || ''} ${tags.join(' ')}`.toLowerCase(),
        };
      });
  }

  function createScrollPoolWeightChoiceKeys(random = Neo.rng) {
    const choices = getScrollChoiceItems();
    const rng = typeof random === 'function' ? random : Math.random;
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
    }
    return choices.slice(0, 4).map(choice => choice.key);
  }

  function getScrollPoolWeightChoices() {
    const choiceKeys = Neo.scrollControlSelection?.choiceKeys || [];
    const choicesByKey = new Map(getScrollChoiceItems().map(choice => [choice.key, choice]));
    return choiceKeys.map(key => choicesByKey.get(key)).filter(Boolean);
  }

  function getScrollChoiceRarity(key) {
    return String(Neo.ITEM_DEFS?.[key]?.rarity || Neo.ITEM_DEFS?.[key]?.category || 'knight').toLowerCase();
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
        copy: 'Choose up to 3 unwanted relics from one rarity. Confirm to pick a replacement from that same class.',
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
        copy: 'Choose 1 of these 4 relics. Future rewards favor that relic for the next 3 floors.',
        minPicks: 1,
        maxPicks: 1,
        choices: getScrollPoolWeightChoices(),
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
    let availableChoices = config.choices;
    if (state.scrollKey === 'scroll_replace' && state.phase !== 'to' && state.picks.length > 0) {
      const selectedRarity = getScrollChoiceRarity(state.picks[0]);
      availableChoices = availableChoices.filter(choice => choice.type !== 'item' || getScrollChoiceRarity(choice.key) === selectedRarity);
    }
    const choices = query ? availableChoices.filter(choice => choice.search.includes(query)) : availableChoices;
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
    const renderChoice = choice => {
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
      const accessibleDescription = choice.description ? `. ${choice.description}` : '';
      return `<button class="scroll-control-choice${selected ? ' is-selected' : ''}" type="button" role="option" aria-selected="${selected}" aria-label="${Neo.escapeHtml(choice.name + accessibleDescription)}" title="${Neo.escapeHtml(choice.description || choice.name)}" data-scroll-choice="${Neo.escapeHtml(choice.key)}" style="--scroll-choice-color:${Neo.escapeHtml(color)}">
        ${orderBadge}
        <span class="scroll-control-choice__iconwrap">${icon}${ownedBadge}</span>
        <span class="scroll-control-choice__body">
          <span class="scroll-control-choice__eyebrow">${Neo.escapeHtml(eyebrow)}</span>
          <span class="scroll-control-choice__name">${Neo.escapeHtml(choice.name)}</span>
        </span>
      </button>`;
    };
    let choicesMarkup = '';
    if (choices.length && choices.every(choice => choice.type === 'item')) {
      const rarityOrder = ['knight', 'wizard', 'god'];
      const rarityLabels = { knight: 'Knight', wizard: 'Wizard', god: 'God', blue: 'Artificer' };
      const groupedChoices = new Map();
      choices.forEach(choice => {
        const rarity = String(choice.rarity || 'knight').toLowerCase();
        if (!groupedChoices.has(rarity)) groupedChoices.set(rarity, []);
        groupedChoices.get(rarity).push(choice);
      });
      const orderedRarities = [
        ...rarityOrder.filter(rarity => groupedChoices.has(rarity)),
        ...[...groupedChoices.keys()].filter(rarity => !rarityOrder.includes(rarity)).sort(),
      ];
      choicesMarkup = orderedRarities.map(rarity => {
        const groupChoices = groupedChoices.get(rarity)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        const label = rarityLabels[rarity] || Neo.titleCase?.(rarity) || rarity;
        return `<section class="scroll-control-group" role="group" aria-label="${Neo.escapeHtml(label)} relics">
          <div class="scroll-control-group__head">
            <span class="scroll-control-group__title">${Neo.escapeHtml(label)} relics</span>
            <span class="scroll-control-group__count">${groupChoices.length}</span>
          </div>
          <div class="scroll-control-group__grid">${groupChoices.map(renderChoice).join('')}</div>
        </section>`;
      }).join('');
    } else if (choices.length) {
      choicesMarkup = choices.map(renderChoice).join('');
    }
    Neo.ui.scrollControlChoices.classList.toggle('is-item-grid', choices.some(choice => choice.type === 'item'));
    Neo.ui.scrollControlChoices.classList.toggle('is-tag-grid', choices.length > 0 && choices.every(choice => choice.type === 'tag'));
    Neo.ui.scrollControlChoices.innerHTML = choicesMarkup || (config.maxPicks <= 0
      ? '<div class="scroll-control-empty"><span class="scroll-control-empty__glyph">✓</span><h4>Ready to apply</h4><p>Confirm to activate this scroll.</p></div>'
      : config.choices.length === 0
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
    if (scrollKey === 'scroll_pool_weight') {
      const nextUseSerial = Math.max(0, Math.floor(Number(Neo.player.scrollUseSerial || 0))) + 1;
      const random = Neo.createScopedRandom?.(
        `scroll:${scrollKey}:offers:${nextUseSerial}:floor:${Neo.floor}`,
      ) || Neo.rng;
      Neo.scrollControlSelection.choiceKeys = createScrollPoolWeightChoiceKeys(random);
    }
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
    if (!config.choices.some(choice => choice.key === choiceKey)) return;
    const picks = state.picks;
    const existing = picks.indexOf(choiceKey);
    if (existing >= 0) picks.splice(existing, 1);
    else {
      if (state.scrollKey === 'scroll_branching') {
        const rarity = getScrollChoiceRarity(choiceKey);
        for (let index = picks.length - 1; index >= 0; index -= 1) {
          if (getScrollChoiceRarity(picks[index]) === rarity) picks.splice(index, 1);
        }
      }
      if (state.scrollKey === 'scroll_replace' && state.phase !== 'to' && picks.length > 0) {
        const activeRarity = getScrollChoiceRarity(picks[0]);
        if (getScrollChoiceRarity(choiceKey) !== activeRarity) {
          picks.splice(0, picks.length);
        }
      }
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
    if (state.picks.length > config.maxPicks) return;
    const validChoiceKeys = new Set(config.choices.map(choice => choice.key));
    if (state.picks.some(key => !validChoiceKeys.has(key))) return;
    if (state.scrollKey === 'scroll_replace' && state.phase !== 'to') {
      const fromRarity = getScrollChoiceRarity(state.picks[0]);
      state.fromKeys = state.picks
        .filter(key => getScrollChoiceRarity(key) === fromRarity)
        .slice(0, 3);
      if (!state.fromKeys.length) return;
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
      const toRarity = getScrollChoiceRarity(toKey);
      Neo.player.scrollReplaceMap = { ...(Neo.player.scrollReplaceMap || {}) };
      state.fromKeys.forEach(fromKey => {
        if (getScrollChoiceRarity(fromKey) === toRarity) Neo.player.scrollReplaceMap[fromKey] = toKey;
      });
    } else if (state.scrollKey === 'scroll_abundance') {
      Neo.player.scrollAbundance = { items: state.picks.slice(0, 2), nextCheckFloor: Neo.floor + 2, expiresFloor: Neo.floor + 8 };
    } else if (state.scrollKey === 'scroll_pool_weight') {
      const buffs = Array.isArray(Neo.player.scrollPoolWeights) ? Neo.player.scrollPoolWeights : [];
      buffs.push({ itemKey: state.picks[0], expiresFloor: Neo.floor + 3 });
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

  function getVoucherType(identifier = '') {
    const value = String(identifier || '');
    return (Neo.VOUCHER_TYPES || []).find(voucher => voucher.key === value || voucher.id === value) || null;
  }

  function getVoucherCount(voucherKey = '') {
    if (voucherKey) {
      const voucher = getVoucherType(voucherKey);
      return voucher ? Math.max(0, Math.floor(Number(Neo.player?.items?.[voucher.key] || 0))) : 0;
    }
    return (Neo.VOUCHER_TYPES || []).reduce((total, voucher) => (
      total + Math.max(0, Math.floor(Number(Neo.player?.items?.[voucher.key] || 0)))
    ), 0);
  }

  function getOwnedVoucherTypes() {
    return (Neo.VOUCHER_TYPES || []).filter(voucher => getVoucherCount(voucher.key) > 0);
  }

  // Vouchers cannot redeem into another voucher. Scrolls live outside ITEM_KEYS,
  // but remain excluded defensively because they require their own targeting UI.
  function getVoucherExcludedKeys() {
    return new Set([
      Neo.LEGACY_VOUCHER_KEY || 'voucher',
      ...(Neo.VOUCHER_KEYS || []),
      ...(Neo.SCROLL_OF_CONTROL_KEYS || []),
    ]);
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

  function ensureVoucherRefs() {
    if (!Neo.ui) return false;
    const ids = [
      'voucherModal', 'voucherTitle', 'voucherCopy', 'voucherTypes',
      'voucherSearch', 'voucherMeta', 'voucherChoices', 'voucherCancel',
      'voucherConfirm',
    ];
    ids.forEach(id => { if (!Neo.ui[id]) Neo.ui[id] = document.getElementById(id); });
    return !!Neo.ui.voucherChoices;
  }

  function renderVoucherModal() {
    const state = Neo.voucherRedeemState;
    if (!state || !ensureVoucherRefs()) return;
    let voucher = getVoucherType(state.voucherKey);
    if (!voucher || getVoucherCount(voucher.key) <= 0) {
      voucher = getOwnedVoucherTypes()[0] || null;
      if (!voucher) {
        cancelVoucherRedeem();
        return;
      }
      state.voucherKey = voucher.key;
      state.selectedItemKey = '';
    }

    const pool = getVoucherRarityPool(voucher.rarity)
      .map(key => {
        const item = Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS?.[key];
        const tags = Array.isArray(item?.tags) ? item.tags : Array.from(item?.tags || []);
        return {
          key,
          name: item?.name || Neo.titleCase?.(key) || key,
          description: item?.description || '',
          rarity: item?.rarity || item?.category || voucher.rarity,
          search: `${item?.name || key} ${item?.description || ''} ${tags.join(' ')}`.toLowerCase(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const query = String(state.query || '').trim().toLowerCase();
    const choices = query ? pool.filter(item => item.search.includes(query)) : pool;
    if (!choices.some(item => item.key === state.selectedItemKey)) state.selectedItemKey = '';

    if (Neo.ui.voucherTitle) Neo.ui.voucherTitle.textContent = `${voucher.label.toUpperCase()} VOUCHER EXCHANGE`;
    if (Neo.ui.voucherCopy) {
      Neo.ui.voucherCopy.textContent = `Choose any ${voucher.classLabel} relic. One ${voucher.label.toLowerCase()} voucher will be consumed.`;
    }
    if (Neo.ui.voucherSearch) Neo.ui.voucherSearch.value = state.query || '';
    if (Neo.ui.voucherTypes) {
      Neo.ui.voucherTypes.innerHTML = (Neo.VOUCHER_TYPES || []).map(entry => {
        const count = getVoucherCount(entry.key);
        const selected = entry.key === voucher.key;
        return `<button class="voucher-type${selected ? ' is-selected' : ''}" type="button" data-voucher-type="${Neo.escapeHtml(entry.key)}" aria-pressed="${selected}"${count <= 0 ? ' disabled' : ''} style="--voucher-color:${Neo.escapeHtml(entry.color)}">
          <span class="voucher-type__swatch" aria-hidden="true"></span>
          <span>${Neo.escapeHtml(entry.label)}</span>
          <b>${count}</b>
        </button>`;
      }).join('');
    }
    if (Neo.ui.voucherMeta) {
      Neo.ui.voucherMeta.textContent = `${choices.length} / ${pool.length} relics · ${getVoucherCount(voucher.key)} voucher${getVoucherCount(voucher.key) === 1 ? '' : 's'}`;
      Neo.ui.voucherMeta.dataset.tone = state.selectedItemKey ? 'ready' : 'pending';
    }

    const ownedItems = Neo.player?.items || {};
    const color = Neo.getRarityNameColor?.(voucher.rarity) || voucher.color;
    const cards = choices.map(item => {
      const selected = item.key === state.selectedItemKey;
      const owned = Math.max(0, Math.floor(Number(ownedItems[item.key] || 0)));
      return `<button class="scroll-control-choice${selected ? ' is-selected' : ''}" type="button" role="option" aria-selected="${selected}" aria-label="${Neo.escapeHtml(item.name + (item.description ? `. ${item.description}` : ''))}" title="${Neo.escapeHtml(item.description || item.name)}" data-voucher-item="${Neo.escapeHtml(item.key)}" style="--scroll-choice-color:${Neo.escapeHtml(color)}">
        ${selected ? '<span class="scroll-control-choice__order scroll-control-choice__order--check">✓</span>' : ''}
        <span class="scroll-control-choice__iconwrap">
          <canvas class="scroll-control-choice__icon" data-item-icon="${Neo.escapeHtml(item.key)}" width="48" height="48"></canvas>
          ${owned > 0 ? `<span class="scroll-control-choice__owned">×${owned}</span>` : ''}
        </span>
        <span class="scroll-control-choice__body">
          <span class="scroll-control-choice__eyebrow">${Neo.escapeHtml(voucher.classLabel)} relic</span>
          <span class="scroll-control-choice__name">${Neo.escapeHtml(item.name)}</span>
        </span>
      </button>`;
    }).join('');
    Neo.ui.voucherChoices.classList.add('is-item-grid');
    Neo.ui.voucherChoices.innerHTML = cards
      ? `<section class="scroll-control-group" role="group" aria-label="${Neo.escapeHtml(voucher.classLabel)} relics">
          <div class="scroll-control-group__head">
            <span class="scroll-control-group__title">${Neo.escapeHtml(voucher.classLabel)} relics</span>
            <span class="scroll-control-group__count">${choices.length}</span>
          </div>
          <div class="scroll-control-group__grid">${cards}</div>
        </section>`
      : '<div class="scroll-control-empty"><span class="scroll-control-empty__glyph">⌕</span><h4>No matches</h4><p>Clear the search to see every relic in this class.</p></div>';
    Neo.drawItemIconCanvases?.(Neo.ui.voucherChoices, 'data-item-icon');
    if (Neo.ui.voucherConfirm) {
      Neo.ui.voucherConfirm.disabled = !state.selectedItemKey;
      Neo.ui.voucherConfirm.textContent = state.selectedItemKey ? 'EXCHANGE VOUCHER' : 'SELECT A RELIC';
    }
  }

  function openVoucherRedeem(voucherKey = '') {
    if (!Neo.player) return false;
    if (Neo.currentRoom?.type !== 'shop') return false;
    if (Neo.isChallengeActive?.('no_items')) {
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.8, text: 'No Items challenge', c: '#ff8894' });
      return false;
    }
    if (getVoucherCount() <= 0) return false;
    const requestedVoucher = getVoucherType(voucherKey);
    const selectedVoucher = requestedVoucher && getVoucherCount(requestedVoucher.key) > 0
      ? requestedVoucher
      : getOwnedVoucherTypes()[0];
    if (!selectedVoucher) return false;
    Neo.voucherRedeemOpen = true;
    Neo.voucherRedeemState = {
      voucherKey: selectedVoucher.key,
      query: '',
      selectedItemKey: '',
    };
    Neo.setVoucherModalOpen?.(true);
    renderVoucherModal();
    return true;
  }

  function cancelVoucherRedeem() {
    Neo.voucherRedeemOpen = false;
    Neo.voucherRedeemState = null;
    Neo.setVoucherModalOpen?.(false);
  }

  function handleVoucherChoiceClick(event) {
    const target = event.target instanceof Element
      ? event.target.closest('[data-voucher-type], [data-voucher-item]')
      : null;
    if (!target || target.disabled || !Neo.voucherRedeemState) return;
    const voucherKey = target.dataset?.voucherType || '';
    if (voucherKey) {
      const voucher = getVoucherType(voucherKey);
      if (!voucher || getVoucherCount(voucher.key) <= 0) return;
      Neo.voucherRedeemState.voucherKey = voucher.key;
      Neo.voucherRedeemState.query = '';
      Neo.voucherRedeemState.selectedItemKey = '';
      renderVoucherModal();
      Neo.ui.voucherSearch?.focus?.();
      return;
    }
    const itemKey = target.dataset?.voucherItem || '';
    if (!itemKey) return;
    Neo.voucherRedeemState.selectedItemKey = itemKey;
    renderVoucherModal();
  }

  function updateVoucherSearch(value) {
    if (!Neo.voucherRedeemState) return;
    Neo.voucherRedeemState.query = String(value || '');
    renderVoucherModal();
  }

  function confirmVoucherRedeem() {
    if (!Neo.player) return false;
    if (Neo.isChallengeActive?.('no_items')) return false;
    const state = Neo.voucherRedeemState;
    const voucher = getVoucherType(state?.voucherKey);
    const itemKey = String(state?.selectedItemKey || '');
    if (!voucher || getVoucherCount(voucher.key) <= 0) return false;
    if (!itemKey || !getVoucherRarityPool(voucher.rarity).includes(itemKey)) return false;

    Neo.player.items[voucher.key] = Math.max(0, getVoucherCount(voucher.key) - 1);
    if (Neo.player.items[voucher.key] <= 0) delete Neo.player.items[voucher.key];
    Neo.syncEquipmentSlotsFromInventory?.();
    const grantedName = Neo.itemRegistry?.get?.(itemKey)?.name || Neo.ITEM_DEFS?.[itemKey]?.name || itemKey;
    Neo.collectItem(itemKey);
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 24, life: 0.9, text: `VOUCHER: ${grantedName}`, c: voucher.color });
    Neo.playSfx?.('item_collect');
    window.achievementEvents?.emit?.('shop:bought');

    if (getVoucherCount() > 0) {
      const nextVoucher = getVoucherCount(voucher.key) > 0 ? voucher : getOwnedVoucherTypes()[0];
      state.voucherKey = nextVoucher.key;
      state.query = '';
      state.selectedItemKey = '';
      renderVoucherModal();
    } else {
      cancelVoucherRedeem();
    }
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
      const summary = getOwnedVoucherTypes()
        .map(voucher => `${getVoucherCount(voucher.key)} ${voucher.label}`)
        .join(', ');
      Neo.ui.shopVoucherBannerSub.textContent = `${count} voucher${count === 1 ? '' : 's'} ready (${summary}) — choose any relic in the matching class.`;
    }
  }

  function applyScrollAbundanceForFloor() {
    const state = Neo.player?.scrollAbundance;
    if (!state) return;
    if (Neo.floor > Number(state.expiresFloor || 0)) {
      delete Neo.player.scrollAbundance;
      Neo.scheduleRunSave?.();
      return;
    }
    if (Neo.floor < Number(state.nextCheckFloor || 999)) return;
    const random = Neo.createScopedRandom?.(`scroll:abundance:${Neo.baseSeedStr || ''}:${Neo.floor}`) || Neo.rng;
    state.nextCheckFloor = Neo.floor + 2;
    const shouldExpire = Neo.floor >= Number(state.expiresFloor || 0);
    if (random() < 0.5) {
      const selected = Array.isArray(state.items) ? state.items.filter(key => Neo.ITEM_DEFS?.[key]) : [];
      const randomPool = (Neo.ITEM_KEYS || []).filter(key => (
        Neo.ITEM_DEFS?.[key]
        && Neo.ITEM_DEFS[key].rarity !== 'blue'
        && !SCROLL_KEYS.has(key)
      ));
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
    }
    if (shouldExpire) delete Neo.player.scrollAbundance;
    Neo.scheduleRunSave?.();
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
    // gets the battery modal, routed through the dispatcher so it respects
    // the safe-to-open checks and paw priority.
    if (playerData !== Neo.player) return;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 0.9, text: 'SELECT A MOVE', c: '#cfd7ff' });
    if (!requestPanelItemSelection()) notifyPanelItemDeferred('extra_battery');
  }

function getExtraBatteryChoiceMoves(playerData = Neo.player) {
    const equipped = new Set(Object.values(playerData?.equippedMoves || {}).filter(Boolean));
    return Object.keys(playerData?.ownedMoves || {})
      .filter(key => (
        playerData.ownedMoves[key]
        && Neo.MOVE_DEFS[key]
        && Neo.isMoveAllowedForCharacter(key, playerData.character)
      ))
      .sort((a, b) => (
        Number(equipped.has(b)) - Number(equipped.has(a))
        || Neo.MOVE_DEFS[a].slot.localeCompare(Neo.MOVE_DEFS[b].slot)
      ));
  }

// Build and show the dedicated battery modal for the active player. Like the
// paw modal it is a blocking overlay that stops time (see update.js), so the
// dispatcher only calls this when it is safe to do so.
export function beginExtraBatteryModal() {
    if (!Neo.player || Math.floor(Number(Neo.player.extraBatteryPendingCount || 0)) <= 0) return;
    Neo.setExtraBatteryModalOpen?.(true);
    renderExtraBatteryPanel();
  }

export function renderExtraBatteryPanel() {
    if (!Neo.ui?.extraBatteryChoices || !Neo.player) return;
    const pending = Math.max(0, Math.floor(Number(Neo.player.extraBatteryPendingCount || 0)));
    if (Neo.ui.extraBatteryPending) {
      Neo.ui.extraBatteryPending.textContent = pending === 1 ? '1 PICK LEFT' : `${pending} PICKS LEFT`;
    }
    if (Neo.ui.extraBatteryCopy) {
      Neo.ui.extraBatteryCopy.textContent = pending > 1
        ? 'Time is stopped. Pick a move for each battery, one at a time — every pick adds +1 max charge.'
        : 'Time is stopped. Pick a move to give it +1 max charge — one more use before its cooldown.';
    }
    const equipped = new Set(Object.values(Neo.player.equippedMoves || {}).filter(Boolean));
    Neo.ui.extraBatteryChoices.innerHTML = getExtraBatteryChoiceMoves()
      .map(key => {
        const def = Neo.MOVE_DEFS[key];
        const slotLabel = Neo.SLOT_LABELS?.[def.slot] || def.slot;
        const isEquipped = equipped.has(key);
        // `slash` is the bare-hands melee fallback: with a weapon equipped the
        // M1 attack IS the weapon, so present the weapon's identity and its
        // weapon-charge count (the grant lands there too, see
        // grantExtraBatteryToMove). data-move stays `slash`.
        const weapon = key === 'slash' ? Neo.WEAPON_DEFS?.[Neo.player.equippedWeapon] : null;
        const currentMaxStacks = weapon
          ? (Neo.getWeaponMaxCharges?.(weapon.key, Neo.player) || 1)
          : Neo.getMoveMaxStacks(key, Neo.player.character, Neo.player);
        const iconHtml = weapon
          ? `<canvas class="extra-battery-choice__icon" data-weapon-icon="${weapon.key}" width="30" height="30"></canvas>`
          : `<canvas class="extra-battery-choice__icon" data-move-icon="${key}" width="30" height="30"></canvas>`;
        return `<button class="extra-battery-choice${isEquipped ? ' is-equipped' : ''}" type="button" data-move="${key}">
          <span class="extra-battery-choice__eyebrow">${isEquipped ? `Equipped — ${slotLabel}` : slotLabel}</span>
          ${iconHtml}
          <h4>${weapon?.name || def.name}</h4>
          <p>${weapon ? (weapon.description || def.desc) : def.desc}</p>
          <span class="extra-battery-choice__charges">Charges ${currentMaxStacks} → ${currentMaxStacks + 1}</span>
        </button>`;
      })
      .join('')
      || '<div class="extra-battery-empty">No moves owned yet — the charge stays banked until you buy a move from the shop.</div>';
    Neo.ui.extraBatteryChoices.querySelectorAll('[data-move-icon]').forEach(canvas => {
      Neo.drawMoveToastIcon?.(canvas, Neo.MOVE_DEFS[canvas.dataset.moveIcon]);
    });
    Neo.ui.extraBatteryChoices.querySelectorAll('[data-weapon-icon]').forEach(canvas => {
      Neo.drawWeaponToastIcon?.(canvas, Neo.WEAPON_DEFS?.[canvas.dataset.weaponIcon]);
    });
  }

export function handleExtraBatteryChoiceClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-move]') : null;
    const moveKey = target?.dataset?.move || '';
    if (!moveKey || !Neo.MOVE_DEFS[moveKey]) return;
    if (Math.floor(Number(Neo.player?.extraBatteryPendingCount || 0)) <= 0) {
      Neo.setExtraBatteryModalOpen?.(false);
      return;
    }
    const nextMaxStacks = grantExtraBatteryToMove(moveKey);
    if (nextMaxStacks <= 0) return;
    const grantedName = (moveKey === 'slash' && Neo.WEAPON_DEFS?.[Neo.player.equippedWeapon]?.name)
      || Neo.MOVE_DEFS[moveKey].name;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 0.8, text: `${grantedName.toUpperCase()} +1 CHARGE`, c: '#cfd7ff' });
    if (Math.floor(Number(Neo.player?.extraBatteryPendingCount || 0)) > 0) {
      renderExtraBatteryPanel();
      return;
    }
    Neo.setExtraBatteryModalOpen?.(false);
    // Chain into any other owed selection now that the modal is closed.
    requestPanelItemSelection();
  }

// "Decide later": the charge stays owed (HUD alert chip / next safe dispatch),
// with the same short grace window the inventory close uses so the dispatcher
// doesn't instantly reopen the modal.
export function dismissExtraBatteryModal() {
    Neo.setExtraBatteryModalOpen?.(false);
    Neo.suppressPanelItemSelectionUntil = Date.now() + 250;
  }

export function grantExtraBatteryToMove(moveKey, playerData = Neo.player) {
    if (!playerData || !Neo.MOVE_DEFS[moveKey]) return 0;
    // M1 with a weapon equipped: weapon attacks run on the weapon-charge
    // system, not move stacks, so the battery must land there — a `slash`
    // stack override would never show up on the weapon's HUD card.
    const weaponKey = moveKey === 'slash' && Neo.WEAPON_DEFS?.[playerData.equippedWeapon]
      ? playerData.equippedWeapon
      : '';
    if (weaponKey) {
      if (!playerData.weaponChargeOverrides || typeof playerData.weaponChargeOverrides !== 'object') {
        playerData.weaponChargeOverrides = {};
      }
      const nextMaxCharges = (Neo.getWeaponMaxCharges?.(weaponKey, playerData) || 1) + 1;
      playerData.weaponChargeOverrides[weaponKey] = nextMaxCharges;
      playerData.extraBatteryPendingCount = Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0)) - 1);
      if (playerData === Neo.player) {
        // ensureWeaponChargeState sees the raised max on its next tick/HUD
        // read and refills the pool, so the paid-for charge shows immediately.
        Neo.markInventoryPanelDirty?.();
        Neo.updateHud?.();
        Neo.scheduleRunSave?.();
      }
      return nextMaxCharges;
    }
    const overrides = ensureMoveStackOverrides(playerData);
    if (!overrides) return 0;
    const nextMaxStacks = Neo.getMoveMaxStacks(moveKey, playerData.character, playerData) + 1;
    overrides[moveKey] = nextMaxStacks;
    playerData.extraBatteryPendingCount = Math.max(0, Math.floor(Number(playerData.extraBatteryPendingCount || 0)) - 1);
    if (playerData === Neo.player) {
      const slot = Neo.MOVE_DEFS[moveKey]?.slot || '';
      // Resolve the slot's active move with the same fallback chain
      // createCooldownEntry uses, so an empty slot (running on its default
      // move) still refreshes the live cooldown entry.
      const slotEntryMoveKey = playerData.equippedMoves?.[slot]
        || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
      if (slot && slotEntryMoveKey === moveKey) {
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
      if (Neo.player.escapeChargeKills >= getChargeRequirement(20)) {
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
    applyShieldOfAegisFloorBonus();
  }

  // Shield of Aegis: on every floor entry, heal 2% of max HP and grant a 50-point
  // shield (overheal barrier) per stack. The barrier uses the standard mechanic, so
  // it begins bleeding away a few seconds after the floor starts.
  function applyShieldOfAegisFloorBonus() {
    const stacks = getItemCount('shield_of_aegis');
    if (stacks <= 0) return;
    const maxHp = Math.max(1, Number(Neo.player.maxHp || 1));
    const heal = maxHp * 0.02 * stacks;
    if (heal > 0) Neo.applyPlayerHealing?.(heal);
    const shield = 50 * stacks;
    Neo.player.overhealBarrier = Number(Neo.player.overhealBarrier || 0) + shield;
    Neo.player.overhealBarrierMax = Math.max(Number(Neo.player.overhealBarrierMax || 0), Neo.player.overhealBarrier);
    Neo.player.overhealBarrierColor = '#ffe7a8';
    Neo.player.overhealBarrierAge = 0;
    Neo.spawnHealPopup?.(Neo.player.x, Neo.player.y - 34, shield, { color: '#ffe7a8', size: 16 });
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y, life: 0.7, ring: Math.min(150, 58 + Math.sqrt(shield) * 3), c: '#ffe7a8' });
  }

  // Expose on Neo
  Neo.migratePlayerData = migratePlayerData;
  Neo.countOwnedToolStacks = countOwnedToolStacks;
  Neo.getArtificerLevelGains = getArtificerLevelGains;
  Neo.getCloakFlatDamageReduction = getCloakFlatDamageReduction;
  Neo.getRichMansBluesCrystalReward = getRichMansBluesCrystalReward;
  Neo.getCharacterDef = getCharacterDef;
  Neo.getUiCharacterKey = getUiCharacterKey;
  Neo.syncCharacterUiTheme = syncCharacterUiTheme;
  Neo.getDefaultWeaponForCharacter = getDefaultWeaponForCharacter;
  Neo.getDefaultMovesForCharacter = getDefaultMovesForCharacter;
  Neo.isMoveAllowedForCharacter = isMoveAllowedForCharacter;
  Neo.KIT_ALTERNATIVES = KIT_ALTERNATIVES;
  Neo.getKitChoice = getKitChoice;
  Neo.setKitChoice = setKitChoice;
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
  Neo.getPendingUiItemCount = getPendingUiItemCount;
  Neo.getPendingUiItems = getPendingUiItems;
  Neo.requestPanelItemSelection = requestPanelItemSelection;
  Neo.renderWizardPawPanel = renderWizardPawPanel;
  Neo.handleWizardPawChoiceClick = handleWizardPawChoiceClick;
  Neo.applyWizardPawStat = applyWizardPawStat;
  Neo.confirmWizardPawSelection = confirmWizardPawSelection;
  Neo.isScrollControlItem = isScrollControlItem;
  Neo.enqueueScrollSelection = enqueueScrollSelection;
  Neo.createScrollPoolWeightChoiceKeys = createScrollPoolWeightChoiceKeys;
  Neo.renderScrollControlPanel = renderScrollControlPanel;
  Neo.updateScrollControlSearch = updateScrollControlSearch;
  Neo.handleScrollControlChoiceClick = handleScrollControlChoiceClick;
  Neo.confirmScrollControlSelection = confirmScrollControlSelection;
  Neo.cancelScrollControlSelection = cancelScrollControlSelection;
  Neo.getVoucherCount = getVoucherCount;
  Neo.getVoucherRarityPool = getVoucherRarityPool;
  Neo.openVoucherRedeem = openVoucherRedeem;
  Neo.cancelVoucherRedeem = cancelVoucherRedeem;
  Neo.handleVoucherChoiceClick = handleVoucherChoiceClick;
  Neo.updateVoucherSearch = updateVoucherSearch;
  Neo.confirmVoucherRedeem = confirmVoucherRedeem;
  Neo.renderVoucherModal = renderVoucherModal;
  Neo.refreshShopVoucherBanner = refreshShopVoucherBanner;
  Neo.applyScrollAbundanceForFloor = applyScrollAbundanceForFloor;
  Neo.openExtraBatterySelection = openExtraBatterySelection;
  Neo.beginExtraBatteryModal = beginExtraBatteryModal;
  Neo.renderExtraBatteryPanel = renderExtraBatteryPanel;
  Neo.handleExtraBatteryChoiceClick = handleExtraBatteryChoiceClick;
  Neo.dismissExtraBatteryModal = dismissExtraBatteryModal;
  Neo.grantExtraBatteryToMove = grantExtraBatteryToMove;
  Neo.consumeCharge = consumeCharge;
  Neo.refreshFloorChargeStates = refreshFloorChargeStates;
