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
    playerData.mooggyZoomiesTime = Number(playerData.mooggyZoomiesTime || 0);
    playerData.lavaWalkTime = Number(playerData.lavaWalkTime || 0);
    playerData.lavaTrailTick = Number(playerData.lavaTrailTick || 0);
    playerData.princessFlightTime = Number(playerData.princessFlightTime || 0);
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

export function syncCharacterUiTheme() {
    document.documentElement.classList.toggle('princess-ui', getUiCharacterKey() === 'princess');
  }

export function getDefaultWeaponForCharacter(characterKey) {
    if (characterKey === 'princess') return 'princess_wand';
    if (characterKey === 'metao') return 'metao_fire_staff';
    if (characterKey === 'granialla') return 'granillia_lightning_spear';
    if (characterKey === 'mooggy') return 'hunters_bow';
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

export function getItemCount(key) {
    return Number(Neo.player?.items?.[key] || 0);
  }

export function getPotionCarryCap() {
    const stacks = getItemCount('mateos_bag');
    if (stacks <= 0) return 0;
    return 3 + (stacks - 1);
  }

export function getChargeRequirement(baseRequirement) {
    return Math.max(1, baseRequirement - getItemCount('charged_adapter'));
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
    if (!Neo.godItemKeysCache) Neo.godItemKeysCache = Neo.ITEM_KEYS.filter(key => Neo.ITEM_DEFS[key]?.rarity === 'god');

    const neoKnife = getItemCount('neo_knife');
    const orbOfBlood = getItemCount('orb_of_blood');
    const hemesScarf = getItemCount('hemes_scarf');
    const attackServo = getItemCount('attack_servo');
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
      bleedChance: neoKnife * 0.05,
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
      critChance,
      critMultiplier: 1.6 + (oracleLens ? critChance * 2.2 : critChance * 0.6),
      attackSpeedMultiplier: robotArm > 0 ? 8 * (1 + attackServo * 0.12 + chronoSpringBonus) : 1 + attackServo * 0.12 + chronoSpringBonus,
      hasRobotArm: robotArm > 0,
      moveSpeedMultiplier: 1 + turtleShell * 0.05,
      xpGainMultiplier: 1 + scholarSeal * 0.15,
      levelEdgeDamageMultiplier: 1 + scholarCap * xpProgress * 0.45,
      knockbackMultiplier: 1 + pushMan * 0.18,
      aoeRadiusMultiplier: (1 + explosiveJelly * 0.2) * Number(characterDef.aoeRadiusMultiplier || 1),
      aoeDamageMultiplier: Number(characterDef.aoeDamageMultiplier || 1),
      beamDamageMultiplier: 1 + dragonOrb * 0.35,
      beamChainTargets: dragonOrb > 0 ? Math.min(2, dragonOrb) : 0,
      beamChainDamageMultiplier: dragonOrb > 0 ? 0.6 + (dragonOrb - 1) * 0.15 : 0,
      projectileBounces: ricocete,
      projectileSpeedMultiplier: 1 + mooggyZoomies * 0.2,
      healingMultiplier: 1 + drinkMaster * 0.2,
      itemDropChanceBonus: Math.min(0.3, richMansLuck * 0.05),
      shopExtraItemOffers: Math.min(3, richMansLuck),
      damageReduction,
      stunResistance: anchorCharm,
      hasIronLung: getItemCount('iron_lung') > 0,
      hasPrincesGlasses: getItemCount('princes_glasses') > 0,
    };
    Neo.itemStatsCacheFrame = Neo.frameId;
    return Neo.itemStatsCacheValue;
  }

export function getAttackSpeedValue() {
    const stats = getItemStats();
    return Math.max(0.2, (Neo.player?.attackSpeed || 1) * (stats.attackSpeedMultiplier || 1));
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

export function openWizardPawSelection() {
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
        : `CONFIRM ${Neo.wizardPawSelection.picks.length}/2`;
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
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 1, text: "WIZARD'S PAW!", c: '#ffd27d' });
    Neo.wizardPawSelection = null;
    Neo.setWizardPawModalOpen(false);
    Neo.markInventoryPanelDirty();
    Neo.renderInventoryPanel();
    Neo.updateHud();
    Neo.scheduleRunSave();
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
    if (chargeType === 'hemes_scarf') {
      Neo.player.scarfHealReady = false;
      Neo.player.scarfChargeKills = 0;
    }
  }

  window.achievementEvents?.on('charge:kill', () => {
    if (!Neo.player) return;
    const stats = getItemStats();
    const chargeSteps = stats.overclockedWatchChance > 0 && Neo.nextRandom('encounter') < stats.overclockedWatchChance ? 2 : 1;
    if (stats.genericHealthItemHealRatio > 0 && Neo.player.hp < Neo.player.maxHp) {
      const heal = Math.min(Neo.player.maxHp - Neo.player.hp, Neo.scalePlayerHealing(Math.max(0, Neo.player.hp * stats.genericHealthItemHealRatio)));
      if (heal > 0) {
        Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + heal);
        Neo.spawnHealPopup(Neo.player.x, Neo.player.y - 22, heal, { color: '#d9ffe5' });
        window.achievementEvents?.emit('heal:applied', { amount: heal });
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
        const warpHint = Neo.formatControlLabel('f', 'f');
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 36, life: 0.9, text: `ADAPTER READY - PRESS ${warpHint}`, c: '#b88cff' });
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
  Neo.getItemCount = getItemCount;
  Neo.getPotionCarryCap = getPotionCarryCap;
  Neo.getChargeRequirement = getChargeRequirement;
  Neo.getKeenEyeCritBonus = getKeenEyeCritBonus;
  Neo.getChronoSpringAttackSpeedBonus = getChronoSpringAttackSpeedBonus;
  Neo.grantCritCharmBuff = grantCritCharmBuff;
  Neo.triggerKeenEyeBuff = triggerKeenEyeBuff;
  Neo.triggerChronoSpringBuff = triggerChronoSpringBuff;
  Neo.getItemStats = getItemStats;
  Neo.getAttackSpeedValue = getAttackSpeedValue;
  Neo.getWizardPawStatCards = getWizardPawStatCards;
  Neo.openWizardPawSelection = openWizardPawSelection;
  Neo.renderWizardPawPanel = renderWizardPawPanel;
  Neo.handleWizardPawChoiceClick = handleWizardPawChoiceClick;
  Neo.applyWizardPawStat = applyWizardPawStat;
  Neo.confirmWizardPawSelection = confirmWizardPawSelection;
  Neo.consumeCharge = consumeCharge;
  Neo.refreshFloorChargeStates = refreshFloorChargeStates;
