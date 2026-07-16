// combat.js — standalone IIFE. Player attacks, hit resolution, status effects, XP/loot.
  const COMBAT_SPATIAL_PADDING = 180;
  const DEFAULT_DAMAGE_OPTIONS = {};
  const NO_BLEED_BONUS_DAMAGE_OPTIONS = { applyBleedBonus: false };
  const MOVING_GUN_PENALTIES = {
    magenta_degale: { maxSpread: 0.18, recoilBonus: 1.4 },
    magenta_p90: { maxSpread: 0.14, recoilBonus: 1 },
  };
  const KICKY_KICK_KNOCKBACK = 1440;
  const KICKY_KICK_BLAST_KNOCKBACK = 400;
  const KICKY_KICK_ROOM_MOVE_CHANCE = 0.1;
  const FORGE_VOUCHER_BOSS_DROP_CHANCE = 0.65;
  const GOD_ITEM_BOSS_DROP_CHANCE = 0.12;

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
    if (enemy?.mirrorExactCopy) return 1;
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
    const bountyWeaknessActive = !!enemy?.bountyWeakness && Neo.getStatusStacks?.(enemy, enemy.bountyWeakness) > 0;
    const bountyWeaknessMultiplier = bountyWeaknessActive ? 1.35 : 1;
    // Pendant of Kronos: flat +1%/god-item damage everywhere, plus +2%/stack
    // against bosses (boss types, miniBosses, and the god enemy).
    const isBoss = Neo.isBossType?.(enemy?.type) || enemy?.type === 'god' || !!enemy?.miniBoss;
    const kronosMultiplier = (stats.kronosDamageMultiplier || 1)
      * (isBoss ? (stats.kronosBossDamageMultiplier || 1) : 1);
    const powered = (damage + (Neo.player?.attackPower || 0))
      * characterMultiplier
      * (stats.levelEdgeDamageMultiplier || 1)
      * kronosMultiplier
      * bountyWeaknessMultiplier
      * (Neo.isChallengeActive('glass_cannon') ? 1.25 : 1);
    const flatReduction = Math.max(0, Number(enemy?.flatDamageReduction || 0));
    if (applyBleedBonus && Neo.getStatusStacks(enemy, 'bleed') > 0 && stats.bleedDamageMultiplier > 1) {
      return Math.max(0, Math.round((powered * stats.bleedDamageMultiplier * damageTakenMultiplier) / defenseMultiplier - flatReduction));
    }
    return Math.max(0, Math.round((powered * damageTakenMultiplier) / defenseMultiplier - flatReduction));
  }

  function scaleRawDamageAgainstEnemy(enemy, damage) {
    const defenseMultiplier = Math.max(1, Number(enemy?.defenseMultiplier || 1));
    const damageTakenMultiplier = getEnemyDamageTakenMultiplier(enemy);
    const flatReduction = Math.max(0, Number(enemy?.flatDamageReduction || 0));
    return Math.max(0, Math.round((Number(damage || 0) * damageTakenMultiplier) / defenseMultiplier - flatReduction));
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
    if (enemy?.mirrorExactCopy) return 1;
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
    const difficultyMultiplier = Math.max(0, Number(Neo.getDifficultyDef?.()?.enemyBleedDamageMultiplier ?? 1));
    const reduced = (preResist / getEnemyBleedResistance(enemy))
      * Math.max(0.2, 1 - itemResistance)
      * difficultyMultiplier;
    return Math.max(1, Math.round(reduced));
  }

  function getPlayerBaseDamage() {
    const characterMultiplier = Neo.getCharacterDef().damageMultiplier || 1;
    // Poison saps the player's strength: each stack shaves ~1% off outgoing damage.
    const poisonMultiplier = Neo.getPoisonDamageMultiplier?.(Neo.player) ?? 1;
    // Foley's charm (GREEN) adds a flat +1 per stack to the raw hit before mults.
    const flatHitBonus = Math.max(0, Number(Neo.getItemStats?.()?.flatHitDamageBonus || 0));
    return Math.max(1, (Neo.ATTACKS.melee.damage + (Neo.player?.attackPower || 0) + flatHitBonus) * characterMultiplier * poisonMultiplier);
  }

  function getEquippedMove(slot) {
    const moveKey = Neo.player?.equippedMoves?.[slot];
    if (Neo.MOVE_DEFS[moveKey]?.slot === slot) return moveKey;
    return Neo.getDefaultMovesForCharacter(Neo.player?.character || Neo.chosenCharacter)[slot] || (slot === 'dash' ? 'dash' : slot === 'melee' ? 'slash' : slot === 'laser' ? 'blood_beam' : 'crimson_smash');
  }

  // --- Live damage readout (for tooltips / inventory / shop) ----------------
  // Reproduces the player-side scaling that scaleDamageAgainstEnemy() applies,
  // but with NO enemy (no defense, flat reduction, bleed bonus, or boss kronos).
  // This is the "what one hit does right now with my build" number. Keep this in
  // lockstep with the `powered = ...` line in scaleDamageAgainstEnemy().
  function scalePlayerDamageForDisplay(base, stats) {
    const s = stats || Neo.getItemStats();
    const characterMultiplier = Neo.getCharacterDef().damageMultiplier || 1;
    const powered = (Number(base) + (Neo.player?.attackPower || 0))
      * characterMultiplier
      * (s.levelEdgeDamageMultiplier || 1)
      * (s.kronosDamageMultiplier || 1)
      * (Neo.isChallengeActive?.('glass_cannon') ? 1.25 : 1);
    return Math.max(1, Math.round(powered));
  }

  // Per-key damage shapes. `base` is the REAL pre-hit damage the cast passes to
  // hitEnemy() in combat.js (a hardcoded literal for most moves — NOT the
  // *_BASE_STATS table, which diverges for several moves). `mult` names an item
  // multiplier from getItemStats() applied before the shared pipeline. `charge`
  // is [minFactor, maxFactor] for hold-to-charge moves. `tick`/`hits` annotate
  // beams and multi-hit bursts for labelling.
  const DISPLAY_DAMAGE = {
    // melee moves
    slash:            { base: 24 },
    fire_balls:       { base: 22, hits: 3 },
    smite:            { base: 20 },
    narwal_fight:     { base: 40 },
    mooggy_swipe:     { base: 44, charge: [1, 2.5] },
    // laser moves
    blood_beam:       { base: 10, mult: 'beamDamageMultiplier', tick: true },
    love_beam:        { base: 14, mult: 'beamDamageMultiplier', tick: true },
    turtle_wave:      { base: 34, mult: 'beamDamageMultiplier', tick: true },
    power_disks:      { base: 20, hits: 8, mult: 'beamDamageMultiplier' },
    blade_justice:    { base: 22, mult: 'beamDamageMultiplier' },
    holy_eye_beams:   { base: 13, mult: 'beamDamageMultiplier', tick: true, hits: 2 },
    lightning_columns:{ base: 18 },
    god_sweep:        { base: 12, mult: 'beamDamageMultiplier', tick: true },
    nail_shot:        { base: 18, hits: 12, mult: 'beamDamageMultiplier' },
    wizard_lazer:     { base: 30, mult: 'beamDamageMultiplier', tick: true },
    mooggy_blood_beam:{ base: 12, mult: 'beamDamageMultiplier', tick: true },
    thorn_blood_beams:{ base: 8,  mult: 'beamDamageMultiplier', tick: true, hits: 4 },
    laser_shockwave:  { base: 22 },
    hammer_throw:     { base: 46, mult: 'beamDamageMultiplier' },
    lightning_cross:  { base: 30, mult: 'beamDamageMultiplier' },
    love_bomb_laser:  { base: 34, mult: 'beamDamageMultiplier' },
    // smash moves
    crimson_smash:    { base: 46, mult: 'aoeDamageMultiplier' },
    hammer_smash:     { base: 46, mult: 'aoeDamageMultiplier' },
    titan_hammer:     { base: 56, mult: 'aoeDamageMultiplier' },
    chaos_burst:      { base: 18, mult: 'aoeDamageMultiplier' },
    fire_circle:      { base: 18, mult: 'aoeDamageMultiplier', tick: true },
    kicky_kick:       { base: 184 },
    wall_of_toph:     { base: 46, mult: 'aoeDamageMultiplier' },
    random_pounce:    { base: 52, mult: 'aoeDamageMultiplier' },
    mooggy_hairball:  { base: 34, mult: 'aoeDamageMultiplier' },
    excalibur_strike: { base: 46, mult: 'aoeDamageMultiplier', hits: 5 },
    holy_turrets:     { base: 26, mult: 'aoeDamageMultiplier' },
    death_ball:       { base: 40, charge: [0.6, 2.6] },
    turtle_powerup:   { base: 18, charge: [1, 44 / 18] },
    // dash moves that hit
    zip_lightning:    { base: 26 },
    nimrod_stomp:     { base: 46, mult: 'aoeDamageMultiplier' },
    knight_slash_dash:{ base: 42 },
  };

  // Returns { min, max, tick, hits, label } for a weapon/move, or null if the
  // item deals no measurable single-hit damage (pure utility/mobility).
  function getDisplayDamage(key, kind) {
    if (!key) return null;
    // The codex is reachable from the main menu with no active run, where
    // getItemStats() has no player to read. Fall back to neutral multipliers so
    // those screens show the build-independent base instead of throwing.
    let stats;
    try { stats = Neo.getItemStats(); } catch (_e) { stats = {}; }
    if (!stats) stats = {};
    let baseLow, baseHigh, tick = false, hits = 0;

    if (kind === 'weapon') {
      const wb = Neo.WEAPON_BASE_STATS?.[key];
      // Excalibur / Katana deal a % of the player's base damage, not the flat
      // table value; Lazer Glasses is a beam whose real per-tick damage (9) is
      // lower than its table entry. Handle both before the generic table branch.
      if (key === 'excalibur' || key === 'katana_excalibur_777x') {
        baseLow = baseHigh = getPlayerBaseDamage() * 7.77 + (Neo.getAnvilWeaponBonus?.(key, 'damage') || 0);
      } else if (key === 'lazer_glasses') {
        baseLow = baseHigh = 9 * (stats.beamDamageMultiplier || 1);
        tick = true;
      } else if (wb && wb.damage) {
        baseLow = baseHigh = wb.damage + (Neo.getAnvilWeaponBonus?.(key, 'damage') || 0);
        if (key === 'claw_gauntlets') hits = 2;
        if (key === 'magenta_p90') hits = 5;
        if (key === 'metao_fire_staff') hits = 3;
      } else {
        return null;
      }
    } else {
      const shape = DISPLAY_DAMAGE[key];
      if (!shape) return null; // utility/mobility moves: no damage line
      const anvil = Neo.getAnvilMoveBonus?.(key, 'damage') || 0;
      let lo = shape.base + anvil;
      let hi = shape.base + anvil;
      if (shape.mult) {
        const m = Number(stats[shape.mult] || 1);
        lo *= m; hi *= m;
      }
      if (shape.charge) { lo *= shape.charge[0]; hi *= shape.charge[1]; }
      baseLow = lo; baseHigh = hi;
      tick = !!shape.tick;
      hits = shape.hits || 0;
    }

    const min = scalePlayerDamageForDisplay(baseLow, stats);
    const max = scalePlayerDamageForDisplay(baseHigh, stats);
    return { min, max, tick, hits, label: formatDisplayDamage({ min, max, tick, hits }) };
  }

  // "DMG 73" | "DMG 24–104" | "DMG 18/tick" | "DMG 22 ×8"
  function formatDisplayDamage(d) {
    if (!d) return '';
    let n = d.min === d.max ? `${d.min}` : `${d.min}–${d.max}`;
    if (d.tick) n += '/tick';
    if (d.hits > 1) n += ` ×${d.hits}`;
    return `DMG ${n}`;
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

  // Weapon cooldown/charge data lives on the canonical Neo.WEAPON_DEFS registry
  // (defined in ui/input.js alongside name/color/rarity), so a weapon is one row
  // there. baseCooldown is seconds, or the sentinel 'melee' to track the melee base
  // cooldown at read time. Unlisted ⇒ DEFAULT_WEAPON_COOLDOWN. maxCharges defaults
  // to 1 (see getWeaponMaxCharges).
  const DEFAULT_WEAPON_COOLDOWN = 0.5;

  function getWeaponBaseCooldown(weaponKey) {
    const raw = Neo.WEAPON_DEFS[weaponKey]?.baseCooldown;
    const base = raw === 'melee' ? Neo.ATTACKS.melee.baseCooldown : (raw ?? DEFAULT_WEAPON_COOLDOWN);
    const bonus = Neo.getAnvilWeaponBonus(weaponKey, 'cooldown');
    return Math.max(base * 0.5, base + bonus);
  }

  // Max charges = static base, raised by Extra Battery picks on the weapon
  // (stored as an absolute count in player.weaponChargeOverrides, mirroring
  // moveStackOverrides). A battery can turn a 1-charge weapon into a charged one.
  function getWeaponMaxCharges(weaponKey, playerState = Neo.player) {
    const base = Math.max(1, Number(Neo.WEAPON_DEFS[weaponKey]?.maxCharges || 1));
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
    triggerArmRecoil(config.angle);
    spawnWeaponProjectile(config);
    if (config.recoil > 0) {
      const recoil = config.recoil * movementPenalty.recoilMultiplier;
      Neo.player.vx -= Math.cos(config.angle) * recoil;
      Neo.player.vy -= Math.sin(config.angle) * recoil;
    }
    if (config.muzzleRing > 0) {
      Neo.ringBurst(Neo.player.x, Neo.player.y, config.muzzleRing, config.color, 0.18);
    }
    return true;
  }

  function triggerArmRecoil(angle = Neo.angleToMouse(), duration = 0.16) {
    if (!Neo.player) return;
    Neo.player.armRecoilUntil = Number(Neo.gameElapsedTime || 0) + duration;
    Neo.player.armRecoilDuration = duration;
    Neo.player.armRecoilA = angle;
    Neo.player.armRecoilFacing = Math.cos(angle) < 0 ? -1 : 1;
  }

  function startPlayerSwing(angle, stabSwing = false) {
    if (!Neo.player) return;
    Neo.player.swing = Neo.ATTACKS.melee.active;
    Neo.player.swingA = angle;
    Neo.player.swingFacing = Math.cos(angle) < 0 ? -1 : 1;
    Neo.player.stabSwing = !!stabSwing;
  }

  // Delay before the claw gauntlets' second swipe lands, in seconds. Short
  // enough to read as a single quick one-two flurry rather than two attacks.
  const CLAW_GAUNTLETS_SECOND_DELAY = 0.12;

  function fireWeaponSweep(damage, range, arc, push, color, options = {}) {
    const angle = Neo.angleToMouse() + Number(options.angleOffset || 0);
    const itemStats = Neo.getItemStats?.() || {};
    const adjustedRange = range + (Neo.player?.character === 'thorn_knight' ? Math.min(34, Number(itemStats.tagCounts?.bleed || 0) * 3) : 0);
    startPlayerSwing(angle, false);
    Neo.playSfx?.('sword_swing');
    forEachEnemyNearPlayer(adjustedRange, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, adjustedRange)) return;
      const targetAngle = Neo.angleBetween(Neo.player, enemy);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > arc) return;
      hitEnemy(enemy, damage, angle, push, color, options);
      rollAndApplyStatus(enemy, 'bleed', options.bleedChance, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4), applyBleed);
      rollAndApplyStatus(enemy, 'bleed', options.itemBleedChance, 1, 5, applyBleed);
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
      const targetAngle = Neo.angleBetween(Neo.player, prop);
      const difference = angleDifferenceAbs(targetAngle, angle);
      const touching = isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, Neo.player.r, touchingBonus);
      if (!touching && difference > arc + arcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function tryWeaponAttack() {
    const weaponKey = getEquippedWeapon();
    if (!weaponKey) return false;
    const angle = Neo.angleToMouse();
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
      triggerArmRecoil(angle, 0.18);
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'metao_fire_staff') {
      triggerArmRecoil(angle);
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
      triggerArmRecoil(angle, 0.18);
      castSmiteChain();
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'excalibur') {
      const excaliburDamage = Math.max(1, Math.round(getPlayerBaseDamage() * 7.77 + Neo.getAnvilWeaponBonus(weaponKey, 'damage')));
      fireWeaponSweep(excaliburDamage, wRng(weaponKey), Math.PI, wKnk(weaponKey), '#ffe291', { rawDamage: true });
      Neo.ringBurst(Neo.player.x, Neo.player.y, 56, '#ffd26a', 0.6);
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
      Neo.ringBurst(Neo.player.x, Neo.player.y, 48, '#ffb35c', 0.45);
      return true;
    }
    if (weaponKey === 'golden_fleece') {
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Neo.ATTACKS.melee.arc, wKnk(weaponKey), '#ffe8a0');
      Neo.player.weaponCooldown = wCd(weaponKey) / attackSpeed;
      return true;
    }
    if (weaponKey === 'sarges_hammer') {
      // Heavy hammer: a wide crushing arc with big knockback and a shock ring.
      fireWeaponSweep(wDmg(weaponKey), wRng(weaponKey), Math.PI * 0.9, wKnk(weaponKey), '#7da3ff');
      Neo.ringBurst(Neo.player.x, Neo.player.y, 44, '#9bb8ff', 0.4);
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
      if (attacked) Neo.tutorialController?.signal?.('attack', { action: 'melee' });
      if (attacked && useRobotArmCharge) Neo.consumeCharge('robot_arm');
      return;
    }
    const move = getEquippedMove('melee');
    const attackSpeed = Neo.getAttackSpeedValue();
    if (!Neo.spendSkillCharge('melee', Neo.getMeleeCooldownDuration(move, attackSpeed))) return;
    Neo.tutorialController?.signal?.('attack', { action: 'melee' });
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
    const angle = Neo.angleToMouse();
    startPlayerSwing(angle, false);
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
      const targetAngle = Neo.angleBetween(Neo.player, enemy);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > Neo.ATTACKS.melee.arc) return;
      hitEnemy(enemy, damage, angle, meleeKnockback, '#0ff', { melee: true });
      rollAndApplyStatus(enemy, 'bleed', slashBleedChance, 1, 5, applyBleed);
      rollAndApplyStatus(enemy, 'bleed', itemStats.bleedChance, 1, 5, applyBleed);
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
      const targetAngle = Neo.angleBetween(Neo.player, prop);
      const difference = angleDifferenceAbs(targetAngle, angle);
      const touching = isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, Neo.player.r, touchingBonus);
      if (!touching && difference > Neo.ATTACKS.melee.arc + destructibleArcBonus) return;
      Neo.damageDestructible(prop, 1);
    });
  }

  function fireLazerGlassesTick() {
    const itemStats = Neo.getItemStats?.() || {};
    const beamDamage = 9 * Number(itemStats.beamDamageMultiplier || 1);
    const baseAngle = Neo.angleToMouse();
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
  const INSTANT_LASER_MOVES = new Set(['power_disks', 'blade_justice', 'lightning_columns', 'nail_shot', 'laser_shockwave', 'hammer_throw', 'lightning_cross']);
  function isInstantLaserMove(move) {
    return INSTANT_LASER_MOVES.has(move || getEquippedMove('laser'));
  }

  function tryLaser() {
    cancelCowardsWayOnAttack();
    if (Neo.laserActive) return;
    const attackSpeed = Neo.getAttackSpeedValue();
    const move = getEquippedMove('laser');
    const rechargeTime = Neo.getLaserCooldownDuration(move, attackSpeed);
    // Love Bomb Laser is hold-to-charge like Death Ball/Nimrod Stomp: spend the
    // charge up front (deferred timer), then updateLoveBombCharge grows the
    // meter each frame and throws the bomb on release.
    if (move === 'love_bomb_laser') {
      if (Neo.loveBombCharging) return; // already winding up
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.tutorialController?.signal?.('attack', { action: 'laser' });
      Neo.loveBombCharging = true;
      Neo.loveBombChargeTime = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: '#ff6fa8' });
      return;
    }
    // Ghost Ball (Turtle Boy alt laser) is hold-to-charge like Death Ball: spend
    // the charge up front (deferred timer), then updateGhostBallCharge grows the
    // meter each frame and summons a ball sized to the charge on release.
    if (move === 'ghost_ball') {
      if (Neo.ghostBallCharging) return; // already winding up
      if (!Neo.spendSkillCharge('laser', rechargeTime, { deferTimer: true })) return;
      Neo.tutorialController?.signal?.('attack', { action: 'laser' });
      Neo.ghostBallCharging = true;
      Neo.ghostBallChargeTime = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: '#8fffe0' });
      return;
    }
    // Spend the laser charge and, on a successful fire, play the laser blast
    // one-shot. Gating on the spend result means held/sustained beams only
    // trigger the sound once at cast time, not every damage tick.
    const spendLaserCharge = (opts) => {
      if (!Neo.spendSkillCharge('laser', rechargeTime, opts)) return false;
      Neo.tutorialController?.signal?.('attack', { action: 'laser' });
      // Lightning Columns plays its own electric one-shot at the call site.
      if (move !== 'lightning_columns') Neo.playSfx?.('lazer_blast');
      return true;
    };
    if (move === 'turtle_wave') {
      if (Neo.player.hp <= 1) {
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.52, text: 'NEED HP', c: '#ff8b98' });
        return;
      }
      if (!spendLaserCharge({ deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'turtle_wave';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Neo.angleToMouse();
      return;
    }
    if (move === 'power_disks') {
      if (!spendLaserCharge()) return;
      spawnPlayerDiskBurst();
      return;
    }
    if (move === 'hammer_throw') {
      if (!spendLaserCharge()) return;
      castHammerThrow(move);
      return;
    }
    if (move === 'blade_justice') {
      if (!spendLaserCharge()) return;
      castBladeOfJustice();
      return;
    }
    if (move === 'holy_eye_beams') {
      if (!spendLaserCharge({ deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'holy_eye_beams';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Neo.angleToMouse();
      // Heal chance rolls once per cast, not per beam/tick.
      Neo.holyEyeBeamsHealRolled = false;
      return;
    }
    if (move === 'love_beam') {
      if (!spendLaserCharge({ deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'beam';
      Neo.loveBeamCasting = true;
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Neo.angleToMouse();
      return;
    }
    if (move === 'lightning_columns') {
      if (!spendLaserCharge()) return;
      Neo.playSfx?.('lightning_charge');
      castLightningColumns();
      return;
    }
    if (move === 'lightning_cross') {
      if (!spendLaserCharge()) return;
      castLightningCross();
      return;
    }
    if (move === 'god_sweep') {
      if (!spendLaserCharge({ deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'god_sweep';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Neo.angleToMouse();
      Neo.laserSweepSpeed = (Neo.nextRandom('encounter') < 0.5 ? -1 : 1) * 4.6;
      return;
    }
    if (move === 'nail_shot') {
      if (!spendLaserCharge()) return;
      castNailShot();
      return;
    }
    if (move === 'laser_shockwave') {
      if (!spendLaserCharge()) return;
      castLaserShockwave();
      return;
    }
    if (move === 'thorn_blood_beams') {
      if (!spendLaserCharge({ deferTimer: true })) return;
      Neo.laserActive = true;
      Neo.laserMode = 'thorn_blood_beams';
      Neo.laserTime = Neo.getLaserCastDuration(move);
      Neo.laserTick = 0;
      Neo.turtleWaveHpTimer = 0;
      Neo.laserAngle = Neo.angleToMouse();
      return;
    }
    if (!spendLaserCharge({ deferTimer: true })) return;
    Neo.laserActive = true;
    Neo.laserMode = 'beam';
    Neo.laserTime = Neo.getLaserCastDuration(move);
    Neo.laserTick = 0;
    Neo.turtleWaveHpTimer = 0;
    Neo.laserAngle = Neo.angleToMouse();
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

  function endTurtleWave() {
    // Turtle Wave ends when its HP drain exhausts the player's HP buffer (either
    // the drain can't be paid, or it drops HP to the 1-HP floor).
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.55, text: 'WAVE ENDED', c: '#ff8b98' });
    return true;
  }

  function tickTurtleWaveHpDrain(dt) {
    if (Neo.laserMode !== 'turtle_wave') return false;
    Neo.turtleWaveHpTimer += dt;
    while (Neo.turtleWaveHpTimer >= 1) {
      Neo.turtleWaveHpTimer -= 1;
      const drain = Math.min(Neo.TURTLE_WAVE_HP_PER_SECOND, Math.max(0, Neo.player.hp - 1));
      if (drain <= 0) return endTurtleWave();
      Neo.player.hp = Math.max(1, Neo.player.hp - drain);
      if (!Neo.isBossFightActive()) Neo.player.roomDamageTaken = (Neo.player.roomDamageTaken || 0) + drain;
      Neo.spawnDamagePopup(Neo.player.x, Neo.player.y - 18, drain, { color: '#74f5ff', size: 14 });
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.42, text: `-${drain} HP`, c: '#74f5ff' });
      if (Neo.player.hp <= 1) return endTurtleWave();
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
      const targetAngle = Neo.angleToMouse();
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
      const holyEyeBeamsActive = Neo.laserMode === 'holy_eye_beams';
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
            ? 14
            : wizardBeamActive
              ? 30
              : mooggyBeamActive
                ? 12
                : thornBeamsActive
                  ? 8
                  : holyEyeBeamsActive
                    ? Neo.MOVE_BASE_STATS.holy_eye_beams.damage
                    : Neo.godTimer > 0
                      ? 16
                      : Neo.ATTACKS.laser.damage;
      const anvilBeamBonus = Neo.getAnvilMoveBonus(move, 'damage');
      // Turtle Boy earns a free laser tier every 3 floors (see grantTurtleLaserStep):
      // each step adds +15% beam damage, stacking for the whole run.
      const turtleLaserMult = Neo.player?.character === 'turtle_boy'
        ? 1 + Math.max(0, Number(Neo.player.turtleLaserSteps || 0)) * 0.15
        : 1;
      const beamDamage = (baseBeamDamage + anvilBeamBonus) * (itemStats.beamDamageMultiplier || 1) * turtleLaserMult;
      const anvilCritBonus = Neo.getAnvilMoveBonus(move, 'critChance');
      const beamKnockback = Neo.laserMode === 'god_sweep' ? 120
        : Neo.laserMode === 'turtle_wave' ? 155
        : loveBeamActive ? 52
        : wizardBeamActive ? 150
        : holyEyeBeamsActive ? 70
        : 60;
      const beamColor = loveBeamActive ? '#ff9ed6'
        : wizardBeamActive ? '#a64bff'
        : mooggyBeamActive ? '#ff2f57'
        : thornBeamsActive ? '#ff3b5c'
        : holyEyeBeamsActive ? '#ffcc33'
        : '#f0f';
      const beamChainColor = loveBeamActive ? '#ffb8e0'
        : wizardBeamActive ? '#c79bff'
        : (mooggyBeamActive || thornBeamsActive) ? '#ff8aa0'
        : holyEyeBeamsActive ? '#ffe08a'
        : '#d890ff';
      const hitOptions = anvilCritBonus > 0 ? { critBonus: anvilCritBonus, beamFx: true } : { beamFx: true };
      const bloodBeamActive = move === 'blood_beam';
      let loveBeamHits = 0;
      let holyEyeBeamHits = 0;
      // Build the set of beam paths to apply this tick. Thorn's Infinite Blood
      // Beam fires four bleeding beams fanned around the aim direction; Holy Eye
      // Beams fires a pair of parallel beams (twin eyes); everything else is a
      // single beam down the aim line.
      const beamAngles = thornBeamsActive
        ? [angle - 0.32, angle - 0.11, angle + 0.11, angle + 0.32]
        : holyEyeBeamsActive
          ? [angle - 0.07, angle + 0.07]
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
          if (holyEyeBeamsActive) holyEyeBeamHits += 1;
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
        const heal = Neo.scalePlayerHealing(Math.min(5, loveBeamHits * 0.8));
        const gained = Neo.applyPlayerHealing(heal);
        if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ff9ed6' });
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 0.22, text: 'LOVE', c: '#ff9ed6' });
      }
      // Holy Eye Beams: one 5%-max-HP heal chance per cast (not per beam/tick),
      // rolled the first time either beam connects.
      if (holyEyeBeamsActive && holyEyeBeamHits > 0 && !Neo.holyEyeBeamsHealRolled) {
        Neo.holyEyeBeamsHealRolled = true;
        if (Neo.rng() < 0.25) {
          const heal = Neo.scalePlayerHealing(Neo.player.maxHp * 0.05);
          const gained = Neo.applyPlayerHealing(heal);
          if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ffcc33' });
          Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 26, life: 0.3, text: 'HOLY', c: '#ffcc33' });
        }
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
    const heal = Neo.getPotionHealAmount() * Math.max(1, Number(itemStats.storedPotionHealingMultiplier || 1)) * (doubled ? 2 : 1);
    const gained = Neo.applyPlayerHealing(heal);
    if (gained > 0) Neo.spawnHealPopup(Neo.player.x + Neo.rand(-10, 10), Neo.player.y - 20, gained);
    if (doubled) Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 34, life: 0.7, text: 'DOUBLE POTION', c: '#9af7d8' });
    Neo.updateHud();
  }

  const HEALING_ZONE_MAX_CHARGE = 5; // charge units required for a full-power zone
  const DEATH_BALL_MAX_CHARGE = 5;   // charge units required for a full-size Death Ball
  const HEALING_ZONE_CHARGE_SPEED_MULTIPLIER = 4;
  const TURTLE_POWERUP_CHARGE_SPEED_MULTIPLIER = 4;
  const NIMROD_STOMP_MAX_CHARGE = 5; // charge units required for a full-power stomp
  const NIMROD_STOMP_CHARGE_SPEED_MULTIPLIER = 4;
  const LOVE_BOMB_MAX_CHARGE = 5;    // charge units required for a full-size Love Bomb
  const GHOST_BALL_MAX_CHARGE = 5;   // charge units required for a full-size Ghost Ball
  // Hold-to-charge moves (Healing Zone, Death Ball, Turtle Power-Up, Nimrod Stomp)
  // charge faster with attack speed, but only take a fraction of the bonus — full
  // 1:1 scaling would make charging trivial for a heavily-stacked build. At 0.4,
  // 3 Attack Servo stacks (+24% attack speed) nets about +10% charge speed.
  const CHARGE_SPEED_ATTACK_SPEED_DAMPING = 0.4;
  // Shared charge-up telegraph for every hold-to-charge move: motes spawn on a
  // ring around the player and drift INWARD, intensifying (denser, brighter
  // flashColor) as the charge ratio climbs toward 1. Originally Mooggy Swipe's
  // effect only; now the common visual for all charging attacks.
  function spawnChargeMotes(ratio, color, flashColor = color) {
    if (ratio <= 0.15 || Math.random() >= 0.35 + ratio * 0.5) return;
    const a = Math.random() * Math.PI * 2;
    const rad = 18 + ratio * 16;
    Neo.spawnParticle({
      x: Neo.player.x + Math.cos(a) * rad, y: Neo.player.y + Math.sin(a) * rad,
      life: 0.2 + ratio * 0.2, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40,
      c: ratio >= 0.99 ? flashColor : color,
    });
  }

  function getChargeSpeedAttackBonus() {
    const attackSpeed = Math.max(0.2, Number(Neo.getAttackSpeedValue?.() || 1));
    return 1 + (attackSpeed - 1) * CHARGE_SPEED_ATTACK_SPEED_DAMPING;
  }

  function trySmash() {
    cancelCowardsWayOnAttack();
    const itemStats = Neo.getItemStats();
    const attackSpeed = Neo.getAttackSpeedValue();
    // Healing Zone is hold-to-charge: attack speed controls how quickly it reaches
    // full charge for a bigger, stronger zone.
    if (getEquippedMove('smash') === 'healing_zone') {
      if (Neo.healingZoneCharging) return; // already winding up
      if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed), { deferTimer: true })) return;
      Neo.tutorialController?.signal?.('attack', { action: 'smash' });
      Neo.healingZoneCharging = true;
      Neo.healingZoneChargeTime = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: '#47ff7d' });
      return;
    }
    // Both of Turtle Boy's smash options are hold-to-charge like Healing Zone.
    // Death Ball hurls a charge-sized blue energy ball at the cursor on release.
    // Turtle Power-Up throws no ball — instead it bursts a small AOE at the
    // player's feet and grants a charge-scaled attack/move-speed surge.
    const smashMoveKey = getEquippedMove('smash');
    if (smashMoveKey === 'death_ball' || smashMoveKey === 'turtle_powerup') {
      if (Neo.deathBallCharging) return; // already winding up
      if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed), { deferTimer: true })) return;
      Neo.tutorialController?.signal?.('attack', { action: 'smash' });
      Neo.deathBallCharging = true;
      Neo.deathBallChargeTime = 0;
      Neo.deathBallPowerUp = smashMoveKey === 'turtle_powerup';
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: Neo.deathBallPowerUp ? '#7dffb0' : '#5aa0ff' });
      return;
    }
    if (!Neo.spendSkillCharge('smash', Neo.getSmashCooldownDuration(attackSpeed))) return;
    Neo.tutorialController?.signal?.('attack', { action: 'smash' });
    if (itemStats.homingMissileChance > 0 && Neo.nextRandom('encounter') < itemStats.homingMissileChance) {
      const base = Neo.angleToMouse();
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
      Neo.ringBurst(Neo.player.x, Neo.player.y - 22, 18, '#ffe06f', 0.5);
    }
    const move = getEquippedMove('smash');
    if (move === 'kicky_kick') {
      castKickyKick();
      return;
    }
    if (move === 'wall_of_toph') {
      castWallOfToph();
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
    if (move === 'titan_hammer') {
      castTitanHammer();
      return;
    }
    const anvilSmashRange = Neo.getAnvilMoveBonus(move, 'range');
    const smashColor = move === 'crimson_smash'
      ? '#ff3048'
      : move === 'chaos_burst'
        ? '#a857ff'
        : move === 'hammer_smash'
          ? '#7da3ff'
          : '#ff66cc';
    const smashRadius = (Neo.ATTACKS.smash.radius + anvilSmashRange) * (itemStats.aoeRadiusMultiplier || 1);
    // Heavy ground slam: trauma-based shake (matches melee feel) plus a big
    // downward camera lurch and a brief hitstop so the impact reads.
    Neo.addTrauma?.(0.8, Math.PI / 2, 26);
    Neo.addHitstop?.(0.06);
    Neo.ringBurst(Neo.player.x, Neo.player.y, smashRadius - 30, smashColor, 0.4);
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, smashRadius, smashColor, 'heavy');
    Neo.playSfx?.('aoe');
    Neo.hitPvpPlayer2InRadius?.(Neo.player.x, Neo.player.y, smashRadius, Neo.ATTACKS.smash.damage + Neo.getAnvilMoveBonus(move, 'damage'), 320, 'pvp_p1_smash');
    const baseSmashDamage = (Neo.godTimer > 0 ? 82 : Neo.ATTACKS.smash.damage) + Neo.getAnvilMoveBonus(move, 'damage');
    forEachEnemyNearPlayer(smashRadius, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, smashRadius)) return;
      const angle = Neo.angleBetween(Neo.player, enemy);
      let damage = baseSmashDamage;
      if (itemStats.bleedDamageMultiplier > 1 && Neo.getStatusStacks(enemy, 'bleed') > 0) {
        damage += Neo.ATTACKS.smash.bonus;
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 16, life: 0.6, text: 'POP', c: '#a0f' });
      }
      hitEnemy(enemy, damage, angle, 320, smashColor, { melee: true });
      // Hammer Smash crushes: a brief hard stun on everything caught in the slam.
      if (move === 'hammer_smash' && !enemy.dead) {
        enemy.stun = Math.max(Number(enemy.stun || 0), 0.7);
      }
    });
    forEachDestructibleNearPlayer(smashRadius, prop => {
      if (!prop.broken && !prop.hidden && isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, smashRadius)) {
        Neo.damageDestructible(prop, 2);
      }
    });
    // Crimson Smash also hurls a ring of rock shards outward — the slam kicks up
    // debris that keeps dealing damage past the AOE edge.
    if (move === 'crimson_smash') {
      const aimBase = Neo.angleToMouse();
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
    // Hammer Smash flings four opposing volleys of heavy debris straight up,
    // down, left, and right — a cross of rock erupting along both screen axes.
    // Tinted to the hammer with big knockback, no bleed.
    if (move === 'hammer_smash') {
      const rockPerSide = 1 + (Neo.player.level % 5);
      const rockDamage = Math.round(baseSmashDamage * 0.4) +1;
      // 0/PI/2/PI/3PI-2 fire right, down, left, and up respectively.
      for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let index = 0; index < rockPerSide; index += 1) {
          const speed = 505 + Neo.nextRandom('fx') * 120;
          // Stagger each rock back along the volley so they read as a line.
          const offset = smashRadius * 0.4 + index * 18;
          Neo.spawnProjectile({
            x: Neo.player.x + dx * offset,
            y: Neo.player.y + dy * offset,
            vx: dx * speed,
            vy: dy * speed,
            r: 7,
            life: 0.6,
            enemy: false,
            kind: 'rock',
            damage: rockDamage,
            knockback: 260,
            color: '#9bb8ff',
            pierceCount: 1,
          });
        }
      }
    }
  }

  function tryDash(moveX, moveY) {
    if (Neo.player.dashTime > 0) return;
    const move = getEquippedMove('dash');
    const attackSpeed = Neo.getAttackSpeedValue();
    const rechargeTime = Neo.getDashCooldownDuration(move, attackSpeed);
    // Nimrod Stomp is hold-to-charge like Death Ball/Healing Zone: spend the
    // charge with a deferred timer and start winding up instead of casting
    // immediately. updateNimrodStompCharge (ticked from update.js) drives the
    // charge and releases on key-up or at max charge.
    if (move === 'nimrod_stomp') {
      if (Neo.nimrodStompCharging) return; // already winding up
      if (!Neo.spendSkillCharge('dash', rechargeTime, { deferTimer: true })) return;
      Neo.tutorialController?.signal?.('dash');
      Neo.nimrodStompCharging = true;
      Neo.nimrodStompChargeTime = 0;
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 16, life: 0.5, text: 'CHARGING', c: '#ffe67a' });
      return;
    }
    if (!Neo.spendSkillCharge('dash', rechargeTime)) return;
    Neo.tutorialController?.signal?.('dash');
    if (move === 'flying_unhitable') {
      castFlyingUntouchable();
      return;
    }
    if (move === 'princess_shield') {
      castPrincessShield();
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
      const hitAngle = Neo.angleBetween(Neo.player, target);
      hitEnemy(target, baseDamage, hitAngle, 185, '#ff3b5c');
      applyBleed(target, 4, 5);
      startPlayerSwing(hitAngle, false);
      Neo.ringBurst(Neo.player.x, Neo.player.y, 16 + hop * 4, '#ff8aa0', 0.22);
    }

    if (!performedHop) {
      // No enemy to chain to — dash toward the aim/move direction and still
      // leave a bleeding slash trail along the path.
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Neo.angleToMouse();
      const fromX = Neo.player.x;
      const fromY = Neo.player.y;
      const fallback = findSafePointNearTarget(Neo.player.x + Math.cos(angle) * 210, Neo.player.y + Math.sin(angle) * 210, Neo.player.r, 120, 16);
      if (fallback) {
        teleportPlayerTo(fallback.x, fallback.y, '#ff3b5c');
        startPlayerSwing(angle, false);
        strikeSlashLine(fromX, fromY, Neo.player.x, Neo.player.y, lineDamage, lineRadius);
      }
    }

    Neo.shake = Math.max(Neo.shake, 7);
    Neo.shakeT = Math.max(Neo.shakeT, 0.13);
    Neo.player.inv = Math.max(Neo.player.inv, 0.26);
    Neo.ringBurst(Neo.player.x, Neo.player.y, 70 * (itemStats.aoeRadiusMultiplier || 1), '#ff8aa0', 0.24);
  }

  // chargeFactor (0..1) scales up the swipe when released from a hold: a full
  // charge boosts damage, reach, arc and knockback for a meaty empowered slash.
  function castMooggySwipe(chargeFactor = 0) {
    const charge = Neo.clamp(Number(chargeFactor) || 0, 0, 1);
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('melee');
    const angle = Neo.angleToMouse();
    startPlayerSwing(angle, false);
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
      const targetAngle = Neo.angleBetween(Neo.player, enemy);
      const diff = angleDifferenceAbs(targetAngle, angle);
      if (diff > arc) return;
      hitEnemy(enemy, damage, angle, knockback, '#ff6090');
      rollAndApplyStatus(enemy, 'bleed', bleedChance, charge >= 0.99 ? 2 : 1, 5, applyBleed);
    });
    forEachDestructibleNearPlayer(range + 8, prop => {
      if (prop.broken || prop.hidden) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, range, 8)) return;
      const targetAngle = Neo.angleBetween(Neo.player, prop);
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

  // Love Bomb Laser (Princess laser alt): hold to charge, release to lob a
  // heart-shaped bomb toward the cursor. It travels for its computed flight
  // time (see castLoveBombLaser's `life`) and detonates in a pink AOE burst on
  // arrival, rather than exploding on first contact with an enemy mid-flight.
  function castLoveBombLaser(chargeRatio = 0) {
    const itemStats = Neo.getItemStats();
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const base = Neo.MOVE_BASE_STATS?.love_bomb_laser?.damage ?? 34;
    const anvilBonus = Neo.getAnvilMoveBonus?.('love_bomb_laser', 'damage') || 0;
    // Tap ~0.6x base, full charge ~2.2x base.
    const damage = Math.max(1, Math.round((base + anvilBonus) * (0.6 + charge * 1.6) * (itemStats.damageMultiplier || 1) * (itemStats.beamDamageMultiplier || 1)));
    const aoeRadius = (48 + charge * 42) * (itemStats.aoeRadiusMultiplier || 1);
    // Sparkle chance scales with charge: a light tap barely dazzles, a full
    // charge reliably marks the whole blast for guaranteed crits.
    const sparkleChance = 0.25 + charge * 0.55;
    const range = Neo.MOVE_BASE_STATS?.love_bomb_laser?.range ?? 420;
    const angle = Neo.angleToMouse();
    const dx = Neo.mouse.worldX - Neo.player.x;
    const dy = Neo.mouse.worldY - Neo.player.y;
    const dist = Math.min(range, Math.hypot(dx, dy) || range);
    const speed = (340 + charge * 120) * (itemStats.projectileSpeedMultiplier || 1);
    Neo.spawnProjectile({
      x: Neo.player.x + Math.cos(angle) * (Neo.player.r + 14),
      y: Neo.player.y + Math.sin(angle) * (Neo.player.r + 14),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 10 + charge * 6,
      life: Math.max(0.12, dist / speed),
      enemy: false,
      kind: 'love_bomb',
      damage,
      aoeRadius,
      sparkleChance,
      color: '#ff6fa8',
    });
    Neo.ringBurst(Neo.player.x, Neo.player.y, 20 + charge * 10, '#ff9cc9', 0.4);
    Neo.playSfx?.('lazer_blast');
    Neo.player.vx -= Math.cos(angle) * (30 + charge * 60);
    Neo.player.vy -= Math.sin(angle) * (30 + charge * 60);
  }

  // Drives the Love Bomb Laser charge (mirrors updateDeathBallCharge): attack
  // speed scales charge gain, release throws a bomb sized to the accumulated
  // charge.
  function updateLoveBombCharge(dt) {
    if (!Neo.loveBombCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      Neo.loveBombCharging = false;
      Neo.queueHeldSkillRecharge?.('laser', Neo.getLaserCooldownDuration('love_bomb_laser', Neo.getAttackSpeedValue()));
      return;
    }
    const chargeSpeed = getChargeSpeedAttackBonus();
    Neo.loveBombChargeTime = Math.min(
      LOVE_BOMB_MAX_CHARGE,
      Number(Neo.loveBombChargeTime || 0) + dt * chargeSpeed
    );
    const atMax = Neo.loveBombChargeTime >= LOVE_BOMB_MAX_CHARGE;
    // Inward-converging motes telegraph the charge (same effect as Mooggy Swipe).
    spawnChargeMotes(Neo.loveBombChargeTime / LOVE_BOMB_MAX_CHARGE, '#ff6fa8', '#ffd0e6');
    if (!Neo.isMouseActionHeld?.('laser') || atMax) {
      const ratio = Neo.loveBombChargeTime / LOVE_BOMB_MAX_CHARGE;
      castLoveBombLaser(ratio);
      Neo.queueHeldSkillRecharge?.('laser', Neo.getLaserCooldownDuration('love_bomb_laser', Neo.getAttackSpeedValue()));
      Neo.loveBombCharging = false;
      Neo.loveBombChargeTime = 0;
    }
  }

  // Drives the Ghost Ball charge (mirrors updateDeathBallCharge): attack speed
  // scales charge gain, release summons a ghost ball sized to the accumulated
  // charge.
  function updateGhostBallCharge(dt) {
    if (!Neo.ghostBallCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      Neo.ghostBallCharging = false;
      Neo.queueHeldSkillRecharge?.('laser', Neo.getLaserCooldownDuration('ghost_ball', Neo.getAttackSpeedValue()));
      return;
    }
    const chargeSpeed = getChargeSpeedAttackBonus();
    Neo.ghostBallChargeTime = Math.min(
      GHOST_BALL_MAX_CHARGE,
      Number(Neo.ghostBallChargeTime || 0) + dt * chargeSpeed
    );
    const atMax = Neo.ghostBallChargeTime >= GHOST_BALL_MAX_CHARGE;
    spawnChargeMotes(Neo.ghostBallChargeTime / GHOST_BALL_MAX_CHARGE, '#8fffe0', '#e0fff6');
    if (!Neo.isMouseActionHeld?.('laser') || atMax) {
      const ratio = Neo.ghostBallChargeTime / GHOST_BALL_MAX_CHARGE;
      castGhostBall(ratio);
      // Cooldown doesn't start ticking until the ball itself fades away (see
      // updateGhostBalls) — the slot stays "held" until then, same mechanism
      // Love Bomb Laser's deferTimer uses for the charge-up phase.
      Neo.ghostBallCharging = false;
      Neo.ghostBallChargeTime = 0;
    }
  }

  // Turtle Boy's Ghost Ball (alt laser): a spectral orb that drifts toward the
  // mouse cursor, passing through enemies rather than dying on first contact.
  // It shrinks a little every second, and shrinks (and weakens) more sharply on
  // every enemy it hits, guttering out once it drops below its minimum size.
  const GHOST_BALL_MIN_RADIUS = 8;    // below this the ball fizzles out
  const GHOST_BALL_DECAY_PER_SEC = 3; // passive radius loss per second alive
  const GHOST_BALL_HIT_DECAY = 6;     // extra radius lost on each enemy hit
  function castGhostBall(chargeRatio = 0) {
    if (!Neo.player) return;
    const itemStats = Neo.getItemStats();
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const base = Neo.MOVE_BASE_STATS?.ghost_ball?.damage ?? 34;
    const anvilBonus = Neo.getAnvilMoveBonus?.('ghost_ball', 'damage') || 0;
    // Tap ~0.6x base, full charge ~2.2x base — same shape as Love Bomb Laser.
    const damage = Math.max(1, Math.round((base + anvilBonus) * (0.6 + charge * 1.6) * (itemStats.beamDamageMultiplier || 1)));
    const startRadius = (18 + charge * 22) * Number(itemStats.aoeRadiusMultiplier || 1); // 18px tap -> 40px full
    const angle = Neo.angleToMouse();
    if (!Array.isArray(Neo.ghostBalls)) Neo.ghostBalls = [];
    Neo.ghostBalls.push({
      x: Neo.player.x + Math.cos(angle) * (Neo.player.r + startRadius * 0.4),
      y: Neo.player.y + Math.sin(angle) * (Neo.player.r + startRadius * 0.4),
      vx: 0,
      vy: 0,
      radius: startRadius,
      startRadius,
      damage,
      hitCooldowns: new Map(), // per-enemy re-hit gate so a slow ball doesn't melt one target every frame
      animSeed: Neo.rand(0, Math.PI * 2, 'fx'),
    });
    Neo.ringBurst(Neo.player.x, Neo.player.y, startRadius * 0.7, '#8fffe0', 0.5);
    Neo.playSfx?.('lazer_blast');
  }

  // Per-frame Ghost Ball behaviour: drift toward the mouse, decay over time,
  // damage enemies on overlap (shrinking further on each hit), and despawn once
  // too small to matter.
  function updateGhostBalls(dt) {
    const balls = Neo.ghostBalls;
    if (!Array.isArray(balls) || balls.length === 0) return;
    if (!Neo.player) { balls.length = 0; return; }
    const GHOST_BALL_SPEED = 300;
    const GHOST_BALL_ACCEL = 6;
    let write = 0;
    for (let read = 0; read < balls.length; read += 1) {
      const ball = balls[read];
      // Passive shrink over time.
      ball.radius -= GHOST_BALL_DECAY_PER_SEC * dt;
      if (ball.radius < GHOST_BALL_MIN_RADIUS) continue; // fizzled out, drop it

      // Chase the mouse cursor's world position, easing toward it rather than
      // snapping — reads as a ghost drifting, not a rigid homing missile.
      const targetX = Neo.mouse.worldX;
      const targetY = Neo.mouse.worldY;
      const dx = targetX - ball.x;
      const dy = targetY - ball.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / dist) * GHOST_BALL_SPEED;
      const desiredVy = (dy / dist) * GHOST_BALL_SPEED;
      ball.vx += (desiredVx - ball.vx) * Math.min(1, GHOST_BALL_ACCEL * dt);
      ball.vy += (desiredVy - ball.vy) * Math.min(1, GHOST_BALL_ACCEL * dt);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Decay per-enemy hit cooldowns.
      if (ball.hitCooldowns.size) {
        ball.hitCooldowns.forEach((value, key) => {
          const next = value - dt;
          if (next <= 0) ball.hitCooldowns.delete(key);
          else ball.hitCooldowns.set(key, next);
        });
      }

      // Damage is scaled to how much of its starting size the ball has left, so
      // a ball that's chewed through several targets hits progressively softer.
      const sizeRatio = Neo.clamp(ball.radius / ball.startRadius, 0, 1);
      const currentDamage = Math.max(1, Math.round(ball.damage * sizeRatio));
      Neo.forEachEnemyNearCircle?.(ball.x, ball.y, ball.radius + 80, enemy => {
        if (ball.radius < GHOST_BALL_MIN_RADIUS) return;
        const hitRadius = ball.radius + enemy.r;
        if (Neo.dist(ball.x, ball.y, enemy.x, enemy.y) > hitRadius) return;
        if (ball.hitCooldowns.has(enemy)) return;
        ball.hitCooldowns.set(enemy, 0.35);
        const hitAngle = Neo.angleBetween(ball, enemy);
        hitEnemy(enemy, currentDamage, hitAngle, 140, '#8fffe0', { lightning: false });
        // Every hit chips a chunk off the ball, on top of its passive decay.
        ball.radius -= GHOST_BALL_HIT_DECAY;
      });
      // Ghost Ball also smashes through pots, crates, and breakable walls.
      if (typeof Neo.forEachDestructibleNearCircle === 'function') {
        Neo.forEachDestructibleNearCircle(ball.x, ball.y, ball.radius + COMBAT_SPATIAL_PADDING, prop => {
          if (ball.radius < GHOST_BALL_MIN_RADIUS) return;
          if (prop.broken || prop.hidden) return;
          if (Neo.dist(ball.x, ball.y, prop.x, prop.y) > ball.radius + (prop.r || 12)) return;
          if (ball.hitCooldowns.has(prop)) return;
          ball.hitCooldowns.set(prop, 0.4);
          Neo.damageDestructible(prop, 2);
        });
      }

      if (Neo.nextRandom('fx') < 0.4) {
        Neo.spawnParticle({ x: ball.x, y: ball.y, life: 0.22, c: '#8fffe0', spark: true, size: 2 });
      }

      if (ball.radius < GHOST_BALL_MIN_RADIUS) continue; // shrank below the floor this frame — drop it
      balls[write++] = ball;
    }
    balls.length = write;
    // The laser slot's recharge starts only once the ball has actually faded
    // away (not when it was thrown) — see the deferred hold in tryLaser/
    // updateGhostBallCharge, resolved here just like a held-beam's endActiveLaser.
    if (write === 0 && !Neo.ghostBallCharging) {
      Neo.queueHeldSkillRecharge?.('laser', Neo.getLaserCooldownDuration('ghost_ball', Neo.getAttackSpeedValue()));
    }
  }

  function castNailShot() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('laser');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const damage = Math.max(1, Math.round((18 + anvilDmg) * (itemStats.beamDamageMultiplier || 1)));
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
        hitOptions: { bleedChance: 0.08, drainChanceBonus: 0.05 },
      });
    }
    Neo.ringBurst(Neo.player.x, Neo.player.y, 22, '#c0d8ff', 0.3);
  }

  // Wall of Toph (smash slot): a ground slam that erupts a ring of rock shards and
  // raises a ring of temporary rock barriers around the player. The barriers are
  // ordinary destructibles, so they block movement and line of fire for both sides
  // and crumble after their ttl runs out (see the destructible update in world.js).
  function castWallOfToph() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('smash');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const anvilRng = Neo.getAnvilMoveBonus(move, 'range');
    const aoeRadius = (150 + anvilRng) * (itemStats.aoeRadiusMultiplier || 1);
    const aoeDmgMult = itemStats.aoeDamageMultiplier || 1;
    const slamDamage = Math.round((Neo.godTimer > 0 ? 70 : 46) * aoeDmgMult) + anvilDmg;
    const rockColor = Neo.getRoomArtTheme?.()?.backdrop || '#8a5a3c';

    // Heavy ground slam: trauma + downward lurch + hitstop, matching Crimson Smash.
    Neo.addTrauma?.(0.8, Math.PI / 2, 26);
    Neo.addHitstop?.(0.06);
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, aoeRadius, rockColor, 'heavy');
    Neo.ringBurst(Neo.player.x, Neo.player.y, aoeRadius - 24, rockColor, 0.45);
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, slamDamage, rockColor);
    Neo.playSfx?.('aoe');

    // Ring of rock shards hurled outward, mirroring Crimson Smash debris.
    const rockCount = 12;
    const rockDamage = Math.round(slamDamage * 0.45);
    for (let index = 0; index < rockCount; index += 1) {
      const angle = (index / rockCount) * Math.PI * 2;
      const speed = 440 + Neo.nextRandom('fx') * 120;
      Neo.spawnProjectile({
        x: Neo.player.x + Math.cos(angle) * (aoeRadius * 0.35),
        y: Neo.player.y + Math.sin(angle) * (aoeRadius * 0.35),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 7,
        life: 0.6,
        enemy: false,
        kind: 'rock',
        damage: rockDamage,
        knockback: 200,
        color: rockColor,
        pierceCount: 1,
        hitOptions: { bleedChance: 0.2, bleedStacks: 1, bleedDuration: 4 },
      });
    }

    // Raise a ring of temporary rock barriers. Each is a normal destructible so it
    // blocks pathing and shots; the ttl makes the wall crumble on its own.
    if (Array.isArray(Neo.destructibles)) {
      const barrierCount = 8;
      const barrierRadius = aoeRadius * 0.82;
      const halfW = 26;
      const halfH = 26;
      // Keep a barrier clear of solid walls (room border, structures, and authored
      // wall-kind destructibles like the wood cover_walls) so rocks never spawn hugging
      // or wedged into a wall. Pots/barrels and the other rocks in the ring don't count.
      const clearRadius = Math.hypot(halfW, halfH) + 12;
      const wallRects = [
        ...Neo.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
        ...Neo.structures.map(s => Neo.getStructureCollisionRect(s)),
        ...Neo.destructibles
          .filter(p => !p.broken && (p.kind === 'wall' || p.kind === 'cover_wall' || p.kind === 'secret_wall'))
          .map(Neo.getDestructibleRect),
      ];
      const hitsWall = (x, y) => wallRects.some(rect =>
        Neo.circleRect(x, y, clearRadius, rect.x, rect.y, rect.w, rect.h));
      for (let index = 0; index < barrierCount; index += 1) {
        const angle = (index / barrierCount) * Math.PI * 2;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        // Walk the spot inward from the ring toward the player until it clears the
        // walls; if the whole spoke is wall, skip this slot.
        let bx = null;
        let by = null;
        for (let radius = barrierRadius; radius >= barrierRadius * 0.45; radius -= 12) {
          const cx = Neo.player.x + dirX * radius;
          const cy = Neo.player.y + dirY * radius;
          // Don't drop a barrier on top of the player.
          if (Neo.dist(cx, cy, Neo.player.x, Neo.player.y) < Neo.player.r + halfW) break;
          if (!hitsWall(cx, cy)) { bx = cx; by = cy; break; }
        }
        if (bx === null) continue;
        Neo.destructibles.push({
          kind: 'cover_wall',
          x: bx,
          y: by,
          w: halfW * 2,
          h: halfH * 2,
          r: Math.hypot(halfW, halfH),
          hp: 8,
          maxHp: 8,
          reinforced: false,
          broken: false,
          ttl: 8,
        });
        Neo.spawnParticle({ x: bx, y: by, life: 0.35, ring: halfW, c: rockColor });
      }
    }
  }

  // Laser Shockwave (laser slot): erupts rock spikes in a vertical line across the
  // full height of the room at the player's x, dealing rock damage to anything caught
  // in the column. The shards are rock-kind projectiles so Pendant of Rock buffs them.
  function castLaserShockwave() {
    const itemStats = Neo.getItemStats();
    const move = getEquippedMove('laser');
    const anvilDmg = Neo.getAnvilMoveBonus(move, 'damage');
    const damage = 22 + anvilDmg;
    const rockColor = Neo.getRoomArtTheme?.()?.backdrop || '#8a5a3c';
    const columnX = Neo.player.x;
    const topY = Neo.WALL + 12;
    const bottomY = Neo.ROOM_H - Neo.WALL - 12;
    const step = 46;

    Neo.addTrauma?.(0.4);
    Neo.spawnAoeShockwave(columnX, Neo.player.y, 60, rockColor, 'light');

    for (let y = topY; y <= bottomY; y += step) {
      Neo.spawnParticle({ x: columnX, y, life: 0.5, ring: 22, c: rockColor });
      // Each spike is a short-lived, near-stationary rock projectile so it hits any
      // enemy standing in the vertical line and inherits the rock-damage bonus.
      Neo.spawnProjectile({
        x: columnX,
        y,
        vx: 0,
        vy: 0,
        r: 18,
        life: 0.45,
        enemy: false,
        kind: 'rock',
        damage,
        knockback: 220,
        color: rockColor,
        pierceCount: 99,
        hitOptions: { bleedChance: 0.15, bleedStacks: 1, bleedDuration: 4 },
      });
    }
    Neo.ringBurst(columnX, Neo.player.y, 30, rockColor, 0.35);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, aoeRadius - 24, '#ff3070', 0.5);
    applyStatusInRadius(Neo.player.x, Neo.player.y, aoeRadius, 'bleed', 2, 5);

    const fangCount = 8;
    const targets = pickRandomEnemies(fangCount);
    for (let index = 0; index < fangCount; index += 1) {
      const spreadAngle = (index / fangCount) * Math.PI * 2;
      const target = targets[index % targets.length];
      let vx, vy;
      if (target) {
        const toTarget = Neo.angleBetween(Neo.player, target);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, 24, '#a0ffcc', 0.35);
  }

  function castDashBurst(moveX, moveY) {
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Neo.angleToMouse();
    const dashSpeed = (520 + Neo.player.attackSpeed * 28) * (Neo.godTimer > 0 ? 1.1 : 1);
    Neo.player.dashTime = 0.16;
    Neo.player.dashX = Math.cos(angle) * dashSpeed;
    Neo.player.dashY = Math.sin(angle) * dashSpeed;
    Neo.player.vx = Neo.player.dashX;
    Neo.player.vy = Neo.player.dashY;
    Neo.player.inv = Math.max(Neo.player.inv, 0.18);
    Neo.shake = Math.max(Neo.shake, 3);
    Neo.shakeT = Math.max(Neo.shakeT, 0.08);
    Neo.playSfx?.('dash');
    Neo.ringBurst(Neo.player.x, Neo.player.y, 18, '#fff06a', 0.28);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, 18, color, 0.35);
    Neo.player.x = targetX;
    Neo.player.y = targetY;
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.ringBurst(Neo.player.x, Neo.player.y, 18, color, 0.35);
  }

  // Nimrod Stomp's leap reach: a short hop (~3 tiles) at a tap, stretching to a
  // full room's length at max charge — hold-to-charge like Death Ball/Healing
  // Zone, so the player can commit to a short precise hop or a room-spanning
  // leap. The requested distance is clamped to the room bounds below regardless,
  // so a max-charge leap always lands right at whichever wall it's aimed at.
  const NIMROD_STOMP_LEAP_RANGE = Neo.ENV_TILE_SIZE * 3;
  const NIMROD_STOMP_LEAP_RANGE_MAX = Math.max(Neo.ROOM_W, Neo.ROOM_H);

  function castNimrodStomp(moveX, moveY, chargeRatio = 0) {
    const itemStats = Neo.getItemStats();
    const angle = Math.hypot(moveX, moveY) > 0.15
      ? Math.atan2(moveY, moveX)
      : Neo.angleToMouse();
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const edgePad = Neo.WALL + Neo.player.r + 4;
    const baseLeapRange = NIMROD_STOMP_LEAP_RANGE + (NIMROD_STOMP_LEAP_RANGE_MAX - NIMROD_STOMP_LEAP_RANGE) * charge;
    const leapRange = baseLeapRange * (itemStats.aoeRadiusMultiplier || 1);
    const targetX = Neo.clamp(Neo.player.x + Math.cos(angle) * leapRange, edgePad, Neo.ROOM_W - edgePad);
    const targetY = Neo.clamp(Neo.player.y + Math.sin(angle) * leapRange, edgePad, Neo.ROOM_H - edgePad);
    const landingPoint = findSafePointNearTarget(targetX, targetY, Neo.player.r, 140, 20);
    if (!landingPoint) return;
    teleportPlayerTo(landingPoint.x, landingPoint.y, '#fff06a');
    // Tap: 108px/46dmg baseline (unchanged feel). Full charge: ~1.5x radius, ~1.7x damage.
    const aoeRadius = (108 + charge * 54) * (itemStats.aoeRadiusMultiplier || 1);
    const stompDamage = Math.round((Neo.godTimer > 0 ? 64 : 46) * (1 + charge * 0.7));
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, stompDamage, '#ffe67a');
    // Landing slam: trauma shake with a downward camera lurch, scaled by charge.
    Neo.addTrauma?.(0.66 + charge * 0.3, Math.PI / 2, 20 + charge * 10);
    Neo.addHitstop?.(0.05 + charge * 0.03);
    Neo.player.inv = Math.max(Neo.player.inv, 0.32);
    Neo.ringBurst(Neo.player.x, Neo.player.y, aoeRadius, '#ffe67a', 0.44);
  }

  // Drives the Nimrod Stomp charge (mirrors updateDeathBallCharge): attack speed
  // scales charge gain, release leaps in whatever direction is currently held
  // (Neo.moveInputX/Y, refreshed every frame in update.js) or the mouse if the
  // player isn't moving, so aim stays live for the whole hold instead of freezing
  // at the moment the charge started.
  function updateNimrodStompCharge(dt) {
    if (!Neo.nimrodStompCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      Neo.nimrodStompCharging = false;
      Neo.queueHeldSkillRecharge?.('dash', Neo.getDashCooldownDuration('nimrod_stomp', Neo.getAttackSpeedValue()));
      return;
    }
    const chargeSpeed = getChargeSpeedAttackBonus() * NIMROD_STOMP_CHARGE_SPEED_MULTIPLIER;
    Neo.nimrodStompChargeTime = Math.min(
      NIMROD_STOMP_MAX_CHARGE,
      Number(Neo.nimrodStompChargeTime || 0) + dt * chargeSpeed
    );
    const atMax = Neo.nimrodStompChargeTime >= NIMROD_STOMP_MAX_CHARGE;
    // Inward-converging motes telegraph the charge (same effect as Mooggy Swipe).
    spawnChargeMotes(Neo.nimrodStompChargeTime / NIMROD_STOMP_MAX_CHARGE, '#ffe67a', '#ffd0e6');
    if (!Neo.dashHeld || atMax) {
      const ratio = Neo.nimrodStompChargeTime / NIMROD_STOMP_MAX_CHARGE;
      castNimrodStomp(Number(Neo.moveInputX || 0), Number(Neo.moveInputY || 0), ratio);
      Neo.queueHeldSkillRecharge?.('dash', Neo.getDashCooldownDuration('nimrod_stomp', Neo.getAttackSpeedValue()));
      Neo.nimrodStompCharging = false;
      Neo.nimrodStompChargeTime = 0;
    }
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
    Neo.playSfx?.('lightning_charge');
    const itemStats = Neo.getItemStats();
    const visited = new Set();
    const hops = 3;
    const baseDamage = Neo.godTimer > 0 ? 34 : 26;
    const lineRadius = 46 * (itemStats.aoeRadiusMultiplier || 1);
    const lineDamage = Math.max(1, Math.round(baseDamage * 0.6));
    // At level 7+ Zip Lightning reaches 150% as far toward enemies (and on the
    // no-enemy fallback dash).
    const RANGE_MULT = Number(Neo.player?.level || 1) >= 7 ? 1.5 : 1;
    let sourceX = Neo.player.x;
    let sourceY = Neo.player.y;
    let performedHop = false;
    for (let hop = 0; hop < hops; hop += 1) {
      const searchX = hop === 0 ? Neo.mouse.worldX : sourceX;
      const searchY = hop === 0 ? Neo.mouse.worldY : sourceY;
      const target = Neo.findNearestEnemy(searchX, searchY, (hop === 0 ? 280 : 260) * RANGE_MULT, visited)
        || Neo.findNearestEnemy(sourceX, sourceY, 260 * RANGE_MULT, visited);
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

      const hitAngle = Neo.angleBetween(Neo.player, target);
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
          Neo.angleBetween(chainSource, chainedEnemy),
          120,
          '#9adfff',
          { rawDamage: true, lightning: true }
        );
        Neo.spawnParticle({ x: (chainSource.x + chainedEnemy.x) * 0.5, y: (chainSource.y + chainedEnemy.y) * 0.5, life: 0.2, c: '#9adfff' });
        chainSource = chainedEnemy;
      }
      Neo.ringBurst(Neo.player.x, Neo.player.y, 16 + hop * 4, '#84cfff', 0.22);
    }

    if (!performedHop) {
      const angle = Math.hypot(moveX, moveY) > 0.15
        ? Math.atan2(moveY, moveX)
        : Neo.angleToMouse();
      const fromX = Neo.player.x;
      const fromY = Neo.player.y;
      const fallbackDist = 190 * RANGE_MULT;
      const fallback = findSafePointNearTarget(Neo.player.x + Math.cos(angle) * fallbackDist, Neo.player.y + Math.sin(angle) * fallbackDist, Neo.player.r, 120, 16);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, zipShock, '#8ad9ff', 0.24);
  }

  function castNarwalFight() {
    const angle = Neo.angleToMouse();
    Neo.playSfx?.('sword_swing');
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, 22, '#ff8ed0', 0.32);
  }

  function getKickyKickRoomDirection(angle) {
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'e' : 'w';
    return y >= 0 ? 's' : 'n';
  }

  function isKickyKickRoomMoveEligible(enemy) {
    if (!enemy || enemy.dead || Number(enemy.hp || 0) <= 0) return false;
    if (['boss', 'god', 'ladder', 'challenge'].includes(Neo.currentRoom?.type)) return false;
    if (enemy.type === 'rival' || enemy.type === 'mirror_knight' || enemy.type === 'boss_spawner') return false;
    return !(Neo.isBossType?.(enemy.type) || enemy.type === 'god' || enemy.miniBoss);
  }

  function tryMoveKickyKickEnemyToNextRoom(enemy, angle) {
    if (!isKickyKickRoomMoveEligible(enemy) || !Neo.currentRoom) return false;
    const direction = getKickyKickRoomDirection(angle);
    const nextRoom = Neo.getConnectedRoom?.(Neo.currentRoom, direction);
    if (!nextRoom || Neo.nextRandom('encounter') >= KICKY_KICK_ROOM_MOVE_CHANCE) return false;
    const enemyIndex = Neo.enemies.indexOf(enemy);
    if (enemyIndex < 0) return false;

    const entryDirection = Neo.OPPOSITE_DIRECTION?.[direction] || 'n';
    const entryPoint = Neo.getDoorEntryPoint?.(entryDirection, enemy.r);
    if (entryPoint) {
      enemy.x = entryPoint.x;
      enemy.y = entryPoint.y;
    }
    Neo.enemies.splice(enemyIndex, 1);
    if (!Array.isArray(nextRoom.enemies)) nextRoom.enemies = [];
    nextRoom.enemies.push(enemy);
    if (enemy.bountyTargetId && Neo.player?.activeBounty?.targetId === enemy.bountyTargetId) {
      Neo.player.activeBounty.targetRoomKey = `${nextRoom.gx},${nextRoom.gy}`;
      Neo.minimapLegendDirty = true;
    }
    Neo.spawnParticle({
      x: Neo.player.x + Math.cos(angle) * 54,
      y: Neo.player.y + Math.sin(angle) * 54 - 18,
      life: 0.75,
      text: 'NEXT ROOM!',
      c: '#ff9bd2',
    });

    if (!Neo.currentRoom.cleared && !Neo.enemies.some(other => other && !other.dead && other.type !== 'rival')) {
      Neo.currentRoom.cleared = true;
      Neo.updateObjective?.();
      Neo.scheduleRunSave?.();
    }
    return true;
  }

  function castKickyKick() {
    const itemStats = Neo.getItemStats();
    const angle = Neo.angleToMouse();
    const radius = 138 * (itemStats.aoeRadiusMultiplier || 1);
    const kickDamage = 184 + Neo.getAnvilMoveBonus('kicky_kick', 'damage');
    const roomMoveCandidates = [];
    Neo.blastRadius(
      Neo.player.x,
      Neo.player.y,
      radius,
      kickDamage,
      '#ff7fc2',
      null,
      KICKY_KICK_BLAST_KNOCKBACK,
    );
    forEachEnemyNearPlayer(radius, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, radius)) return;
      const enemyAngle = Neo.angleBetween(Neo.player, enemy);
      Neo.applyImpulse(enemy, enemyAngle, KICKY_KICK_KNOCKBACK);
      roomMoveCandidates.push({ enemy, angle: enemyAngle });
    });
    roomMoveCandidates.forEach(candidate => tryMoveKickyKickEnemyToNextRoom(candidate.enemy, candidate.angle));
    Neo.playSfx?.('aoe');
    Neo.player.vx -= Math.cos(angle) * 260;
    Neo.player.vy -= Math.sin(angle) * 260;
    // Kick the camera back along the recoil direction (away from the strike).
    Neo.addTrauma?.(0.58, angle + Math.PI, 18);
    Neo.ringBurst(Neo.player.x, Neo.player.y, radius * 0.85, '#ff7fc2', 0.42);
  }

  function castFlyingUntouchable() {
    Neo.playSfx?.('dash');
    Neo.player.princessFlightTime = 15;
    Neo.player.inv = Math.max(Neo.player.inv, 15);
    Neo.player.vx = 0;
    Neo.player.vy = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.8, text: 'FLY HIGH', c: '#ffd1ea' });
  }

  // Princess's alt dash: raises a pink overheal barrier worth 40% of max HP
  // (stacking onto any existing barrier, like Turtle Power-Up's shell).
  const PRINCESS_SHIELD_BARRIER_RATIO = 0.4;
  const PRINCESS_SHIELD_COLOR = '#ff5fb0';
  // Churu Stick's auto-fire threshold, reused here: below 15% HP the shield
  // raises itself automatically, gated only by the dash slot's own cooldown/charge
  // (the same resource a manual cast spends) — no separate cooldown tracked.
  const PRINCESS_SHIELD_AUTO_HP_RATIO = 0.15;

  function castPrincessShield() {
    Neo.playSfx?.('dash');
    const barrierGain = Math.round(Number(Neo.player.maxHp || 0) * PRINCESS_SHIELD_BARRIER_RATIO);
    if (barrierGain > 0) {
      const current = Number(Neo.player.overhealBarrier || 0) + barrierGain;
      Neo.setOverhealBarrier?.(current, Math.max(Number(Neo.player.overhealBarrierMax || 0), current), PRINCESS_SHIELD_COLOR);
      Neo.spawnHealPopup?.(Neo.player.x, Neo.player.y - 44, barrierGain, { color: PRINCESS_SHIELD_COLOR, size: 12 });
    }
    Neo.ringBurst(Neo.player.x, Neo.player.y, 40, PRINCESS_SHIELD_COLOR, 0.42);
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 18, life: 0.8, text: 'SHIELD UP', c: PRINCESS_SHIELD_COLOR });
  }

  // Auto-fires Princess's Shield the moment HP drops below 15%, exactly like
  // Churu Stick's low-HP auto-heal (see updateEquipmentEffects in hud.js) — a
  // per-frame poll gated only by the dash slot's normal charge/cooldown, not a
  // bespoke cooldown field. Ticked from update.js.
  function updatePrincessShieldAutoTrigger() {
    if (!Neo.player || Neo.gameState !== 'play') return;
    if (Neo.player.character !== 'princess') return;
    if (getEquippedMove('dash') !== 'princess_shield') return;
    if (Neo.player.dashTime > 0) return;
    if (Neo.player.hp <= 0 || Neo.player.hp >= Neo.player.maxHp * PRINCESS_SHIELD_AUTO_HP_RATIO) return;
    tryDash(0, 0);
  }

  function applyResponsiveVelocity(current, desired, dt) {
    const isStopping = Math.abs(desired) < 0.001;
    const isTurning = !isStopping && current !== 0 && Math.sign(current) !== Math.sign(desired);
    const response = isStopping ? 20 : isTurning ? 24 : 14;
    const next = current + (desired - current) * Math.min(1, response * dt);
    return Math.abs(next) < 4 ? 0 : next;
  }

  function spawnPlayerDiskBurst() {
    const itemStats = Neo.getItemStats();
    const beamMult = itemStats.beamDamageMultiplier || 1;
    const isMetao = Neo.player?.character === 'metao';
    const diskHitOptions = isMetao
      ? { drainChanceBonus: 0.05, fireChance: 0.4, fireStacks: 1, fireDuration: 3 }
      : { drainChanceBonus: 0.05 };
    const shardHitOptions = isMetao
      ? { drainChanceBonus: 0.05, fireChance: 0.25, fireStacks: 1, fireDuration: 2 }
      : { drainChanceBonus: 0.05 };
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
        damage: Math.max(1, Math.round(20 * beamMult)),
        hitOptions: diskHitOptions,
        // Disks periodically shed faster sub-projectiles perpendicular to travel.
        subSpawn: {
          kind: 'disk_shard',
          interval: 0.18,
          timer: 0.18,
          speed: 620,
          r: 4,
          life: 0.7,
          damage: Math.max(1, Math.round(8 * beamMult)),
          count: 2,
          hitOptions: shardHitOptions,
        },
      });
    }
  }

  // Sarge's Hammer Throw (laser slot): hurl a spinning hammer toward the cursor.
  // It uses the same boomerang flight as the double-kill hammer — flies out, hits,
  // then arcs back to Sarge — but is a manually aimed skill, not a passive proc.
  function castHammerThrow(move) {
    if (!Neo.player) return;
    const itemStats = Neo.getItemStats();
    const base = Neo.MOVE_BASE_STATS?.[move]?.damage ?? 46;
    const anvilBonus = Neo.getAnvilMoveBonus?.(move, 'damage') || 0;
    const damage = Math.max(1, Math.round((base + anvilBonus) * (itemStats.damageMultiplier || 1) * (itemStats.beamDamageMultiplier || 1)));
    const angle = Neo.angleToMouse();
    Neo.spawnProjectile({
      x: Neo.player.x,
      y: Neo.player.y,
      vx: Math.cos(angle) * 680,
      vy: Math.sin(angle) * 680,
      r: 11,
      life: 0.55,
      enemy: false,
      kind: 'sarges_hammer',
      damage,
      knockback: 300,
      color: '#7da3ff',
      // Outbound arm flies straight; on first enemy hit OR when life runs out it
      // arcs home to the player (boomerang handling lives in world.js).
      pierceCount: 1,
      boomerang: true,
      boomerangPhase: 'out',
      homing: true,
      homingTarget: 'enemy',
      homingRadius: 700,
      homingSpeed: 760,
      homingAccel: 2.4,
      homingTurnRate: 2.6,
    });
    Neo.ringBurst?.(Neo.player.x, Neo.player.y, 26, '#9bb8ff', 0.4);
    Neo.playSfx?.('sword_swing');
    // A little recoil for weight.
    Neo.player.vx -= Math.cos(angle) * 90;
    Neo.player.vy -= Math.sin(angle) * 90;
  }

  function spawnFireballs() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    const base = Neo.angleToMouse();
    for (let index = -1; index <= 1; index += 1) {
      const angle = base + index * 0.18;
      Neo.spawnProjectile({ x: Neo.player.x, y: Neo.player.y, vx: Math.cos(angle) * 560, vy: Math.sin(angle) * 560, r: 8, life: 1.6, enemy: false, kind: 'fireball', damage: 22, splash: 48 * aoeRadiusMultiplier, splashDamage: Math.round(14 * aoeDamageMultiplier), blockedSplashDamage: Math.round(16 * aoeDamageMultiplier), fireStacks: 2, fireDuration: 3.4 });
    }
    Neo.playSfx?.('fire_burn');
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
    // Hot white-pink flash core so each pop reads instantly, plus the purple ring beneath it.
    Neo.ringBurst(px, py, 10 * aoeRadiusMultiplier, '#ffe6ff', 0.22);
    Neo.ringBurst(px, py, 20 * aoeRadiusMultiplier, '#e79bff', 0.5);
    Neo.blastRadius(px, py, 52 * aoeRadiusMultiplier, Math.round(18 * aoeDamageMultiplier), '#c86bff');
    for (let index = 0; index < 5; index += 1) {
      const sparkAngle = Neo.rand(Math.PI * 2, 0, 'fx');
      const speed = Neo.rand(240, 100, 'fx');
      Neo.spawnParticle({
        x: px,
        y: py,
        life: Neo.rand(0.32, 0.16, 'fx'),
        vx: Math.cos(sparkAngle) * speed,
        vy: Math.sin(sparkAngle) * speed,
        c: index % 2 === 0 ? '#ffe6ff' : '#a857ff',
        spark: true,
        size: 3,
      });
    }
    Neo.shake = Math.max(Number(Neo.shake || 0), 6);
    Neo.shakeT = Math.max(Number(Neo.shakeT || 0), 0.1);
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
    const aimAngle = Neo.angleToMouse();
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, 30, '#fff6a3', 0.4);
  }

  // Per-frame flying-sword behaviour for Blade Justice.
  function updateJusticeBlades(dt) {
    const blades = Neo.justiceBlades;
    if (!Array.isArray(blades) || blades.length === 0) return;
    if (!Neo.player) { blades.length = 0; return; }

    // Whole formation tracks the mouse so the swords feel mouse-controlled.
    const mouseAim = Neo.angleToMouse();
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
        const angle = Neo.angleBetween(Neo.player, enemy);
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

  const TITAN_HAMMER_SWING_COOLDOWN = 1; 
  const TITAN_HAMMER_FOLLOW_RADIUS = 120;
  // The hammer despawns once 90% of its own recharge has elapsed, so it's
  // gone a beat before the player can summon another one rather than lingering
  // at max duration right up to the recast.
  const TITAN_HAMMER_LIFE_RATIO = 0.7;
  // Only the first two clicks per summon trigger the big AOE slam; after that
  // it keeps hovering (and still chips away via contact damage) but can't slam
  // again until the player recasts smash.
  const TITAN_HAMMER_MAX_SWINGS = 2;
  // Passive contact damage: touching the hammer head while it hovers/follows
  // ticks a much smaller hit than a full slam, on a per-enemy cooldown so it
  // can't melt a single target instantly.
  const TITAN_HAMMER_CONTACT_COOLDOWN = 0.35;
  const TITAN_HAMMER_CONTACT_DAMAGE_RATIO = 0.18;

  // Sarge alt-smash: summon a giant hammer that hovers near the cursor. Click
  // to slam it down for a heavy AOE crush; it stays out until its timer runs
  // down or the player casts smash again.
  function castTitanHammer() {
    const itemStats = Neo.getItemStats();
    const anvilBonus = Neo.getAnvilMoveBonus('titan_hammer', 'damage') || 0;
    const baseDamage = (Neo.godTimer > 0 ? 90 : 70) + anvilBonus;
    const damage = Math.max(1, Math.round(baseDamage * (itemStats.aoeDamageMultiplier || 1)));
    const cooldownDuration = Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue());
    Neo.titanHammer = {
      x: Neo.player.x,
      y: Neo.player.y,
      angle: 0,
      life: cooldownDuration * TITAN_HAMMER_LIFE_RATIO,
      swingCooldown: 0,
      swinging: 0, // 0..1 progress through an active slam animation
      damage,
      radius: (Neo.ATTACKS.smash.radius || 130) * (itemStats.aoeRadiusMultiplier || 1) * 0.75,
      swingsLeft: TITAN_HAMMER_MAX_SWINGS,
      contactCooldowns: new Map(),
      _wasDown: !!Neo.mouse.down || !!Neo.mouse.downQueued,
    };
    Neo.tutorialController?.signal?.('attack', { action: 'smash' });
    Neo.ringBurst(Neo.player.x, Neo.player.y, 26, '#7da3ff', 0.4);
  }

  // Per-frame Titan Hammer behaviour: hover toward the mouse, and slam down
  // whenever the player clicks (a fresh left-click, not a held button).
  function updateTitanHammer(dt) {
    const hammer = Neo.titanHammer;
    if (!hammer) return;
    if (!Neo.player) { Neo.titanHammer = null; return; }

    hammer.life -= dt;
    if (hammer.life <= 0) { Neo.titanHammer = null; return; }

    // Hover at a fixed reach out in front of the player, steered by the mouse.
    const mouseAim = Neo.angleToMouse();
    hammer.angle = Neo.turnAngleToward ? Neo.turnAngleToward(hammer.angle, mouseAim, 10 * dt) : mouseAim;
    const targetX = Neo.player.x + Math.cos(hammer.angle) * TITAN_HAMMER_FOLLOW_RADIUS;
    const targetY = Neo.player.y + Math.sin(hammer.angle) * TITAN_HAMMER_FOLLOW_RADIUS;
    hammer.x += (targetX - hammer.x) * Math.min(1, dt * 12);
    hammer.y += (targetY - hammer.y) * Math.min(1, dt * 12);

    if (hammer.swingCooldown > 0) hammer.swingCooldown -= dt;
    if (hammer.swinging > 0) {
      hammer.swinging = Math.max(0, hammer.swinging - dt * 4.5);
    }

    // Fresh click (edge-triggered): compare against last frame's button state
    // ourselves rather than relying on Neo.mouse.downQueued, since that flag
    // is already consumed earlier in the frame by the melee-attack input
    // handling (LMB doubles as both melee and, while the hammer is out, smash).
    const mouseDown = !!Neo.mouse.down || !!Neo.mouse.downQueued;
    const clicked = mouseDown && !hammer._wasDown;
    hammer._wasDown = mouseDown;
    if (clicked && hammer.swingCooldown <= 0 && hammer.swingsLeft > 0) {
      hammer.swingCooldown = TITAN_HAMMER_SWING_COOLDOWN;
      hammer.swinging = 1;
      hammer.swingsLeft -= 1;
      Neo.addTrauma?.(0.6, hammer.angle, 18);
      Neo.addHitstop?.(0.05);
      Neo.ringBurst(hammer.x, hammer.y, hammer.radius - 20, '#7da3ff', 0.35);
      Neo.spawnAoeShockwave(hammer.x, hammer.y, hammer.radius, '#7da3ff', 'heavy');
      Neo.playSfx?.('aoe');
      Neo.hitPvpPlayer2InRadius?.(hammer.x, hammer.y, hammer.radius, hammer.damage, 280, 'pvp_p1_smash');
      Neo.forEachEnemyNearCircle?.(hammer.x, hammer.y, hammer.radius, enemy => {
        if (!enemy || enemy.dead) return;
        const angle = Neo.angleBetween(hammer, enemy);
        hitEnemy(enemy, hammer.damage, angle, 300, '#7da3ff', { melee: true });
        enemy.stun = Math.max(Number(enemy.stun || 0), 0.6);
      });
      if (typeof Neo.forEachDestructibleNearCircle === 'function') {
        Neo.forEachDestructibleNearCircle(hammer.x, hammer.y, hammer.radius + COMBAT_SPATIAL_PADDING, prop => {
          if (prop.broken || prop.hidden) return;
          if (Neo.dist(hammer.x, hammer.y, prop.x, prop.y) > hammer.radius + (prop.r || 12)) return;
          Neo.damageDestructible(prop, 2);
        });
      }
    }

    // Passive contact damage: the hammer head still hurts to touch even once
    // its slams are spent, on a per-enemy cooldown so standing next to it
    // doesn't melt a target instantly.
    if (hammer.contactCooldowns.size) {
      hammer.contactCooldowns.forEach((value, key) => {
        const next = value - dt;
        if (next <= 0) hammer.contactCooldowns.delete(key);
        else hammer.contactCooldowns.set(key, next);
      });
    }
    const headRadius = hammer.radius * 0.32;
    const contactDamage = Math.max(1, Math.round(hammer.damage * TITAN_HAMMER_CONTACT_DAMAGE_RATIO));
    Neo.forEachEnemyNearCircle?.(hammer.x, hammer.y, headRadius + 80, enemy => {
      if (!enemy || enemy.dead) return;
      if (Neo.dist(hammer.x, hammer.y, enemy.x, enemy.y) > headRadius + enemy.r) return;
      if (hammer.contactCooldowns.has(enemy)) return;
      hammer.contactCooldowns.set(enemy, TITAN_HAMMER_CONTACT_COOLDOWN);
      const angle = Neo.angleBetween(hammer, enemy);
      hitEnemy(enemy, contactDamage, angle, 120, '#9bb8ff', { melee: true });
    });
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
    const angle = Neo.angleToMouse();
    Neo.playSfx?.('lightning_charge');
    // Spear is a jab, not a swipe: a tight forward thrust rather than a wide arc.
    startPlayerSwing(angle, true);

    // Physical thrust: a narrow forward stab that reaches a little further than a
    // swipe but only hits what is roughly in front of the player.
    const physicalDamage = 20;
    const stabArc = 0.45; // ~26 degrees to each side — tight, jab-like
    const smiteRange = Neo.ATTACKS.melee.range + 18;
    forEachEnemyNearPlayer(smiteRange, enemy => {
      if (!enemy) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, enemy, smiteRange)) return;
      const targetAngle = Neo.angleBetween(Neo.player, enemy);
      const difference = angleDifferenceAbs(targetAngle, angle);
      if (difference > stabArc) return;
      hitEnemy(enemy, physicalDamage, angle, Neo.ATTACKS.melee.push, '#fff6a3', { lightning: true });
    });
    forEachDestructibleNearPlayer(smiteRange, prop => {
      if (prop.broken || prop.hidden) return;
      if (!isWithinRadiusSq(Neo.player.x, Neo.player.y, prop, smiteRange)) return;
      const targetAngle = Neo.angleBetween(Neo.player, prop);
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
      Neo.ringBurst(current.x, current.y, 18 + jumps * 3, '#cfdcff', 0.32);
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
    // A full charge roughly doubles the radius and ttl and boosts heal/damage.
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const radius = 62 * aoeRadiusMultiplier * (1 + charge);
    const ttl = 4.8 * (1 + charge);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, radius * 0.5, '#35ff6f', 0.7);
    if (charge > 0.05) {
      Neo.shake = Math.max(Neo.shake, 4 + charge * 6);
      Neo.shakeT = Math.max(Neo.shakeT, 0.14);
    }
  }

  // Drives the Healing Zone charge: effective attack speed scales charge gain,
  // then releasing creates a zone based on the accumulated charge ratio.
  function updateHealingZoneCharge(dt) {
    if (!Neo.healingZoneCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      // Bail out cleanly (e.g. on death / room change) — refund the cooldown timer.
      Neo.healingZoneCharging = false;
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      return;
    }
    const chargeSpeed = getChargeSpeedAttackBonus() * HEALING_ZONE_CHARGE_SPEED_MULTIPLIER;
    Neo.healingZoneChargeTime = Math.min(
      HEALING_ZONE_MAX_CHARGE,
      Number(Neo.healingZoneChargeTime || 0) + dt * chargeSpeed
    );
    const atMax = Neo.healingZoneChargeTime >= HEALING_ZONE_MAX_CHARGE;
    // Inward-converging motes telegraph the charge (same effect as Mooggy Swipe).
    spawnChargeMotes(Neo.healingZoneChargeTime / HEALING_ZONE_MAX_CHARGE, '#47ff7d', '#ffd0e6');
    // Release when the key is let go, or auto-release at full charge.
    if (!Neo.smashHeld || atMax) {
      const ratio = Neo.healingZoneChargeTime / HEALING_ZONE_MAX_CHARGE;
      castHealingZone(ratio);
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      Neo.healingZoneCharging = false;
      Neo.healingZoneChargeTime = 0;
    }
  }

  // Death Ball (Sarge's R): a big blue energy ball hurled toward the cursor. Charge
  // ratio (0..1) scales both its radius and damage — a tap makes a small fast ball,
  // a full charge makes a huge slow crusher. It's a slow piercing projectile that
  // grinds through enemies and shatters props in its path.
  function castDeathBall(chargeRatio = 0) {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const radius = (16 + charge * 34) * aoeRadiusMultiplier; // 16px (tap) -> 50px (full)
    const base = Neo.MOVE_BASE_STATS?.death_ball?.damage ?? 40;
    const anvilBonus = Neo.getAnvilMoveBonus?.('death_ball', 'damage') || 0;
    // Tap ~0.6x base, full charge ~2.6x base.
    const damage = Math.max(1, Math.round((base + anvilBonus) * (0.6 + charge * 2.0) * (itemStats.damageMultiplier || 1)));
    const angle = Neo.angleToMouse();
    // Bigger balls roll slower (heavier), smaller ones zip out faster.
    const speed = 520 - charge * 200;
    Neo.spawnProjectile({
      x: Neo.player.x + Math.cos(angle) * (Neo.player.r + radius * 0.4),
      y: Neo.player.y + Math.sin(angle) * (Neo.player.r + radius * 0.4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: radius,
      life: 1.6 + charge * 0.8,
      enemy: false,
      kind: 'death_ball',
      damage,
      knockback: 220 + charge * 260,
      color: '#5aa0ff',
      // Pierces a lot so a charged ball plows through a whole pack.
      pierceCount: 4 + Math.round(charge * 8),
    });
    Neo.ringBurst(Neo.player.x, Neo.player.y, radius * 0.8, '#5aa0ff', 0.6);
    if (charge > 0.05) {
      Neo.shake = Math.max(Neo.shake, 4 + charge * 7);
      Neo.shakeT = Math.max(Neo.shakeT, 0.14);
    }
    Neo.playSfx?.('lazer_blast');
    // Recoil scales with the ball's heft.
    Neo.player.vx -= Math.cos(angle) * (60 + charge * 120);
    Neo.player.vy -= Math.sin(angle) * (60 + charge * 120);
  }

  // Drives the Death Ball charge (mirrors updateHealingZoneCharge): attack speed
  // scales charge gain, release spawns a ball sized to the accumulated charge.
  function updateDeathBallCharge(dt) {
    if (!Neo.deathBallCharging) return;
    if (!Neo.player || Neo.gameState !== 'play') {
      Neo.deathBallCharging = false;
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      return;
    }
    const chargeSpeed = getChargeSpeedAttackBonus()
      * (Neo.deathBallPowerUp ? TURTLE_POWERUP_CHARGE_SPEED_MULTIPLIER : 1);
    Neo.deathBallChargeTime = Math.min(
      DEATH_BALL_MAX_CHARGE,
      Number(Neo.deathBallChargeTime || 0) + dt * chargeSpeed
    );
    const atMax = Neo.deathBallChargeTime >= DEATH_BALL_MAX_CHARGE;
    // Inward-converging motes telegraph the charge (same effect as Mooggy Swipe).
    spawnChargeMotes(
      Neo.deathBallChargeTime / DEATH_BALL_MAX_CHARGE,
      Neo.deathBallPowerUp ? '#7dffb0' : '#5aa0ff',
      '#ffd0e6'
    );
    if (!Neo.smashHeld || atMax) {
      const ratio = Neo.deathBallChargeTime / DEATH_BALL_MAX_CHARGE;
      // Turtle Power-Up throws no ball — it's a pure self-buff burst. Death Ball
      // hurls the charged energy ball as usual.
      if (Neo.deathBallPowerUp) applyTurtlePowerUp(ratio);
      else castDeathBall(ratio);
      Neo.queueHeldSkillRecharge?.('smash', Neo.getSmashCooldownDuration(Neo.getAttackSpeedValue()));
      Neo.deathBallCharging = false;
      Neo.deathBallChargeTime = 0;
      Neo.deathBallPowerUp = false;
    }
  }

  // Turtle Power-Up release (Turtle Boy's alt smash): erupt a small AOE shockwave at
  // the player's feet, grant a barrier worth 25% of current HP, and a timed surge to
  // attack and move speed. The speed surge's strength and duration scale with the
  // charge ratio, so a full-charge release is a big rampage and a tap is a brief
  // nudge. No projectile is thrown.
  const DEATH_BALL_BUFF_MAX_DURATION = 6;   // seconds at full charge
  const DEATH_BALL_BUFF_MAX_POWER = 0.6;    // +60% attack & move speed at full charge
  function applyTurtlePowerUp(chargeRatio = 0) {
    const charge = Neo.clamp(Number(chargeRatio) || 0, 0, 1);
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    // Small AOE burst at the player's feet (smaller than crimson/hammer smashes).
    const aoeRadius = (60 + charge * 40) * aoeRadiusMultiplier;
    const aoeDamage = Math.max(1, Math.round((18 + charge * 26) * aoeDamageMultiplier));
    Neo.spawnAoeShockwave(Neo.player.x, Neo.player.y, aoeRadius, '#7dffb0', 'light');
    Neo.ringBurst(Neo.player.x, Neo.player.y, aoeRadius * 0.7, '#7dffb0', 0.5);
    Neo.blastRadius(Neo.player.x, Neo.player.y, aoeRadius, aoeDamage, '#7dffb0');
    // Shell barrier: 25% of current HP as an overheal barrier, stacking onto any
    // existing barrier.
    const barrierGain = Math.round(Number(Neo.player.hp || 0) * 0.25);
    if (barrierGain > 0) {
      const current = Number(Neo.player.overhealBarrier || 0) + barrierGain;
      Neo.setOverhealBarrier?.(current, Math.max(Number(Neo.player.overhealBarrierMax || 0), current), '#7dffb0');
      Neo.spawnHealPopup?.(Neo.player.x, Neo.player.y - 44, barrierGain, { color: '#7dffb0', size: 12 });
    }
    // Timed attack/move-speed surge — longer charge = stronger and longer.
    const duration = 1.5 + charge * (DEATH_BALL_BUFF_MAX_DURATION - 1.5);
    const power = DEATH_BALL_BUFF_MAX_POWER * (0.4 + charge * 0.6);
    Neo.player.deathBallBuffTime = duration;
    Neo.player.deathBallBuffPower = power;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 28, life: 0.7, text: 'POWER UP!', c: '#7dffb0' });
    Neo.playSfx?.('lazer_blast');
  }

  function castFireCircle() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    Neo.hazards.push({ kind: 'fire_circle', x: Neo.player.x, y: Neo.player.y, r: 96 * aoeRadiusMultiplier, ttl: 5.2, dps: 18 * aoeDamageMultiplier, followPlayer: true });
    Neo.ringBurst(Neo.player.x, Neo.player.y, 34, '#ff7b32', 0.55);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, radius - 24, '#85df63', 0.45);
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

  // Mateo Potion Bath: full cleanse + 20s status resistance, heal 20% total with a
  // short regen, vanish for 5s, and erupt in explosions around the caster.
  function castPotionBath() {
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const aoeDamageMultiplier = itemStats.aoeDamageMultiplier || 1;
    // Count distinct active statuses BEFORE cleansing — the dirtier you are,
    // the bigger the sparkle eruption when the bath washes it all off.
    const stackCount = Neo.getActiveStatusCount?.(Neo.player) || 0;
    const sparkleBoost = 1 + stackCount * 0.35;
    // Cleanse every damaging/cold status off the player.
    Neo.STATUS_KEYS.forEach(key => Neo.clearStatus(Neo.player, key));
    // Resist new statuses for 20s and become hidden + invulnerable for 5s.
    Neo.player.statusResistTime = Math.max(Number(Neo.player.statusResistTime || 0), 20);
    Neo.player.warpHideTime = Math.max(Number(Neo.player.warpHideTime || 0), 5);
    Neo.player.inv = Math.max(Number(Neo.player.inv || 0), 5);
    // Heal 10% of max HP now, then regen another 10% over the next 5 seconds.
    const burst = Neo.applyPlayerHealing(Math.round(Neo.player.maxHp * 0.1));
    if (burst > 0) Neo.spawnHealPopup(Neo.player.x, Neo.player.y - 22, burst, { color: '#9af7d8' });
    Neo.player.potionRegenTime = 5;
    Neo.player.potionRegenAccum = 0;
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.8, text: 'POTION BATH', c: '#9af7d8' });
    Neo.addTrauma?.(0.7, Math.PI / 2, 20);
    // Explosions around you — scaled by how many statuses got washed off, so a
    // heavily-stacked player erupts in more, hotter sparkle blasts.
    const burstRadius = 56 * aoeRadiusMultiplier * (1 + stackCount * 0.12);
    const burstCount = 7 + Math.round(stackCount * 1.5);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (index / burstCount) * Math.PI * 2 + Neo.rng() * 0.4;
      const dist = Neo.rand(40, 150, 'fx');
      const px = Neo.player.x + Math.cos(angle) * dist;
      const py = Neo.player.y + Math.sin(angle) * dist;
      Neo.ringBurst(px, py, 22 * aoeRadiusMultiplier * sparkleBoost, '#b6f0ff', 0.5);
      Neo.blastRadius(px, py, burstRadius, Math.round(30 * aoeDamageMultiplier * sparkleBoost), '#b6f0ff');
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



    Neo.ringBurst(cx, cy, 36, '#ffd980', 0.5);
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
          Neo.ringBurst(sword.x, sword.y, 16 + ratio * 60, '#ffe6a3', 0.18);
        }
        if (sword.fall <= 0) {
          // Impact slam — the only damage this ability deals.
          sword.phase = 'hover';
          Neo.addTrauma?.(0.5, Math.PI / 2, 14);
          Neo.addHitstop?.(0.04);
          Neo.spawnAoeShockwave(sword.x, sword.y, sword.radius, '#ffd980', 'heavy');
          if (sword.enemy) {
            if (Neo.dist(sword.x, sword.y, Neo.player.x, Neo.player.y) <= sword.radius + Neo.player.r) {
              const angle = Math.atan2(Neo.player.y - sword.y, Neo.player.x - sword.x);
              Neo.damagePlayer(sword.damage, angle, 180, sword.source || 'rival_excalibur', {
                sourceKey: sword.source || 'rival_excalibur',
                sourceLabel: sword.sourceLabel || 'Rival Excalibur Strike',
              });
            }
          } else {
            Neo.blastRadius(sword.x, sword.y, sword.radius, sword.damage, '#ffd980');
          }
          Neo.ringBurst(sword.x, sword.y, sword.radius, '#fff1c2', 0.5);
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
    const baseAngle = Neo.angleToMouse();
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
      Neo.ringBurst(tx, ty, 22, '#fff1b0', 0.5);
    }
  }

  function castLightningColumns() {
    const aoeRadiusMultiplier = Neo.getItemStats().aoeRadiusMultiplier || 1;
    const angle = Neo.angleToMouse();
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
      Neo.ringBurst(Neo.mouse.worldX + ox, Neo.mouse.worldY + oy, 24, '#8dd4ff', 0.45);
    });
  }

  // Sarge's alt laser: two room-spanning lightning bolts through the player,
  // one horizontal and one vertical, forming a cross. Mirrors the "lightning
  // strike line" hazard Bowman's Bane uses for Justice of Sonichu, but
  // player-owned (damages enemies) and heals Sarge 1% max HP per enemy hit.
  function castLightningCross() {
    Neo.playSfx?.('lightning_charge');
    const itemStats = Neo.getItemStats();
    const aoeRadiusMultiplier = itemStats.aoeRadiusMultiplier || 1;
    const px = Neo.player.x;
    const py = Neo.player.y;
    const damage = (Neo.godTimer > 0 ? 40 : 30) * (itemStats.aoeDamageMultiplier || 1) * (itemStats.beamDamageMultiplier || 1);
    const lines = [
      { x1: 0, y1: py, x2: Neo.ROOM_W, y2: py },
      { x1: px, y1: 0, x2: px, y2: Neo.ROOM_H },
    ];
    lines.forEach(line => {
      Neo.hazards.push({
        kind: 'lightning_strike_line',
        source: 'lightning_cross',
        x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
        r: 26 * aoeRadiusMultiplier,
        warn: 0.5,
        warnTick: 0,
        tick: 0,
        interval: 0.14,
        ttl: 0.5 + 0.4,
        damage,
        healPct: 0.01,
      });
    });
    Neo.ringBurst(px, py, 40, '#bfe4ff', 0.4);
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
    if (enemy?.mirrorExactCopy) return 0;
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
    // Knave body rolls make an elite "unfazed": harder to knock back and, since
    // the stun threshold/duration also read this level, harder to stun/confuse.
    if (enemy?.eliteUnfazed > 0) level += enemy.eliteUnfazed * 0.1;
    return Math.max(0, level);
  }
  Neo.getEnemyCcLevel = getEnemyCcLevel;

  // Enemy crit aggression: enemies that don't author their own crit get a global,
  // time-based ramp so a run never stays "safe" forever. Every 5 elapsed minutes
  // adds +5% crit chance, +5% crit damage and +5% raw damage. Crit chance is run
  // through the shared roll-back (applyCritRollback): at 100% it converts to ×1.5
  // crit damage and rolls back to 75%, so late runs keep getting scarier crits.
  // The base enemy crit damage starts at 1.5×.
  function getEnemyTimeAggression() {
    const minutes = Math.max(0, Number(Neo.gameElapsedTime || 0) / 60);
    const steps = Math.floor(minutes / 5); // one bump per full 5 minutes
    // Overclocked Watch shaves a flat fraction off how much each step buffs the
    // enemies (the +5% crit chance/damage/raw-damage bumps), capped in getItemStats.
    const aggressionCut = Neo.clamp(Number(Neo.getItemStats?.()?.overclockedWatchAggressionCut || 0), 0, 0.9);
    const perStep = 0.05 * (1 - aggressionCut);
    const rawCritChance = steps * perStep;
    const baseCritMultiplier = 1.5 + steps * perStep;
    const rolled = Neo.applyCritRollback(rawCritChance, baseCritMultiplier);
    return {
      steps,
      critChance: Neo.clamp(rolled.critChance, 0, 1),
      critMultiplier: rolled.critMultiplier,
      damageMultiplier: 1 + steps * perStep,
    };
  }
  Neo.getEnemyTimeAggression = getEnemyTimeAggression;

  // An enemy is "dangerous" (shown with a red-bordered name tag) when a single
  // hit can wipe the player from full HP — either its base attack already meets
  // the player's max HP, or it has a heavy crit chance (>=60%) whose crit damage
  // reaches max HP. Crit chance/multiplier come from the per-enemy authored crit
  // (eliteCrit, ×1.4 in damagePlayer); the time-based aggression ramp is global
  // and not enemy-specific, so it is intentionally excluded here.
  const DANGEROUS_CRIT_CHANCE = 0.6;
  const ELITE_CRIT_MULTIPLIER = 1.4;
  function isEnemyDangerous(enemy) {
    if (!enemy) return false;
    const maxHp = Math.max(1, Number(Neo.player?.maxHp || 0));
    const baseDmg = Number(enemy.dmg || 0);
    if (baseDmg >= maxHp) return true;
    const critChance = Number(enemy.eliteCrit || 0);
    if (critChance >= DANGEROUS_CRIT_CHANCE && baseDmg * ELITE_CRIT_MULTIPLIER >= maxHp) return true;
    return false;
  }
  Neo.isEnemyDangerous = isEnemyDangerous;

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
    Neo.ringBurst(enemy.x, enemy.y, enemy.r + 18, '#ffe66d', 0.36);
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
    Neo.ringBurst(Neo.player.x, Neo.player.y, Neo.player.r + 18, '#ffe66d', 0.36);
    return true;
  }

  // Tooth of Thorn lifesteal: a small chance per hit to heal 1 when below max HP.
  // Lives on its own so multi-beam moves (Thorn's Infinite Blood Beam) can roll it
  // once per beam that lands, instead of once per tick after the damage dedup.
  function rollToothOfThornDrain(enemy, cachedStats, bonusChance = 0, isMelee = false) {
    const stats = cachedStats || Neo.getItemStats();
    // Melee swings land far less often than a held beam, so they roll a higher
    // per-hit chance (meleeDrainChance) to keep the lifesteal worthwhile.
    const baseChance = isMelee ? Number(stats.meleeDrainChance || 0) : Number(stats.drainChance || 0);
    if (!(baseChance > 0)) return;
    let drainChance = Math.max(0, baseChance + Number(bonusChance || 0));
    if (!(drainChance > 0)) return;
    // Higher-level enemies resist lifesteal: starting at level 5, every full 5
    // levels grants +15% drain resistance (lvl 5 → 15%, lvl 10 → 30%, …),
    // capped so the steal never becomes impossible.
    const enemyLevel = Math.max(1, Number(Neo.getEnemyProgressionLevel?.(enemy)) || 0);
    const drainResistance = Math.min(0.9, Math.floor(enemyLevel / 5) * 0.15);
    drainChance *= (1 - drainResistance);
    if (!(drainChance > 0)) return;
    if (!Neo.player || Neo.player.hp >= Neo.player.maxHp) return;
    if (Neo.nextRandom('encounter') >= drainChance) return;
    // Instant steal: the flat 1 HP plus 1% of the drained enemy's max HP, so the
    // bite scales against tankier foes instead of being a flat trickle.
    const enemyMax = Math.max(1, Number(enemy?.max || enemy?.hp || 1));
    const bite = 1 + enemyMax * 0.01;
    const heal = Neo.scalePlayerHealing(bite, 1);
    const gained = Neo.applyPlayerHealing(heal);
    if (gained > 0) {
      Neo.spawnHealPopup(Neo.player.x + Neo.rand(-6, 6), Neo.player.y - 22, gained, { color: '#ff8fb4', size: 13 });
    }
    // …then a lingering bleed-out: heal a little of the same bite each second for
    // a couple of seconds. Procs refresh the window and stack the per-second rate
    // up to a cap so chaining drains keeps the trickle topped up.
    Neo.player.thornDrainTime = 2.5;
    Neo.player.thornDrainRate = Math.min(enemyMax * 0.04, Number(Neo.player.thornDrainRate || 0) + bite * 0.5);
  }

  function rollProcEffect(chance, baseMultiplier = 1) {
    const rolled = Neo.applyProcRollback?.(chance, baseMultiplier) || { procChance: Number(chance || 0), effectMultiplier: Number(baseMultiplier || 1) };
    return {
      chance: Neo.clamp(Number(rolled.procChance || 0), 0, 0.999),
      multiplier: Math.max(1, Number(rolled.effectMultiplier || 1)),
    };
  }

  function applyStatusPower(entity, key, multiplier) {
    if (!(multiplier > 1)) return;
    const state = Neo.getStatusState?.(entity, key);
    if (!state || Number(state.stacks || 0) <= 0) return;
    state.damageMultiplier = Math.max(Number(state.damageMultiplier || 1), multiplier);
  }

  function rollAndApplyStatus(enemy, key, chance, stacks, duration, applyFn, options = {}) {
    if (!(chance > 0)) return false;
    const rolled = rollProcEffect(chance, options.baseMultiplier || 1);
    if (Neo.nextRandom('encounter') >= rolled.chance) return false;
    const scaledDuration = Number(duration || 0) * (options.durationScales === false ? 1 : rolled.multiplier);
    applyFn(enemy, stacks, scaledDuration);
    applyStatusPower(enemy, key, rolled.multiplier);
    return true;
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
    // Hit-time crit bonuses (weapons, anvil moves) can push chance past 100%, so
    // run the roll-back here too: overflow becomes extra crit damage on top of the
    // already rolled-back multiplier from getItemStats.
    const critRollback = Neo.applyCritRollback((stats.critChance || 0) + Number(options.critBonus || 0), stats.critMultiplier || 1.6);
    const critChance = Neo.clamp(critRollback.critChance, 0, 1);
    const critMultiplier = critRollback.critMultiplier;
    const elBartoAmbush = !!Neo.player?.elBartoAmbushReady && Number(Neo.player?.equipmentEffects?.el_bartos_cape?.time || 0) > 0;
    let dealt = options.rawDamage ? scaleRawDamageAgainstEnemy(enemy, damage) : scaleDamageAgainstEnemy(enemy, damage, options, stats);
    // Copper Penny: every electric/lightning hit deals +20% damage per stack and
    // builds a stacking Static charge on the target. Static is a DoT that arcs to
    // nearby foes (see updateEnemyStatuses), so electric builds chain through packs.
    const copperPennyStacks = options.lightning ? (Neo.getItemCount?.('copper_penny') || 0) : 0;
    if (copperPennyStacks > 0) dealt = Math.max(1, Math.round(dealt * (1 + copperPennyStacks * 0.2)));
    if (Number(enemy.graveZoneVulnerableUntil || 0) > Number(Neo.gameElapsedTime || 0)) {
      dealt = Math.max(1, Math.round(dealt * Math.max(1, Number(enemy.graveZoneDamageTakenMultiplier || 1))));
    }
    if (Number(stats.coldDamageTakenMultiplier || 1) > 1 && Neo.getStatusStacks?.(enemy, 'slow') > 0) {
      dealt = Math.max(1, Math.round(dealt * Number(stats.coldDamageTakenMultiplier || 1)));
    }
    if (sandbox) dealt = Math.max(1, Math.round(dealt * sandbox.playerDamageMultiplier));
    // Sparkle Charm marks enemies so every hit against them is a guaranteed crit.
    const sparkled = Number(enemy.critSparkle || 0) > 0;
    const isCrit = elBartoAmbush || sparkled || (critChance > 0 && Neo.nextRandom('encounter') < critChance);
    // Higher-level enemies (deeper/later runs, scaled by difficulty) resist
    // knockback: the impulse is divided by 1+ccLevel, so they need a bigger hit to
    // be moved and to cross the heavy-knockback stun threshold. No cap.
    const knockbackResistFactor = 1 / (1 + getEnemyCcLevel(enemy));
    const appliedKnockback = knockback * (stats.knockbackMultiplier || 1) * knockbackResistFactor;
    if (isCrit) dealt = Math.round(dealt * critMultiplier);
    // Rivals are meant to be tougher than a normal enemy: a flat 20% damage
    // reduction on top of their stats. Friends are already exempted above.
    if (enemy?.type === 'rival') dealt = Math.max(1, Math.round(dealt * (1 - Neo.RIVAL_DAMAGE_REDUCTION)));
    // The final boss shrugs off a flat 5% of every incoming hit on top of its stats.
    if (enemy?.type === 'god') dealt = Math.max(1, Math.round(dealt * 0.95));
    // Shield units can't channel a new shield while actively taking fire: any
    // incoming hit — even one fully absorbed by an existing barrier — opens a
    // recharge lockout window that holds their support cooldown reset until it
    // elapses.
    enemy._shieldHitLockout = 1.1;
    if (!options.ignoreBarrier && (enemy.barrier || 0) > 0) {
      const absorbed = Math.min(enemy.barrier, dealt);
      enemy.barrier -= absorbed;
      dealt -= absorbed;
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - 20, life: 0.4, text: `BLOCK ${absorbed}`, c: '#7ed6ff' });
      if (dealt <= 0) {
        Neo.applyImpulse(enemy, angle, appliedKnockback * 0.35);
        applyEnemyImpactStun(enemy, 0, appliedKnockback * 0.35);
        return;
      }
    }
    enemy.hp -= dealt;
    Neo.applyImpulse(enemy, angle, appliedKnockback);
    if (Number.isFinite(angle)) {
      enemy._lastHitAngle = angle;
      enemy._lastHitAt = performance.now();
    }
    applyEnemyImpactStun(enemy, dealt, appliedKnockback);
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
      // 57% chance for a random enemy hurt grunt on top of the hit thunk.
      if (Neo.nextRandom('encounter') < 0.57) Neo.playSfx?.('enemy_hurt');
    }
    // Game feel: directional trauma scaled to impact (vs target max HP).
    // Chip damage gets nothing; crits and big slams get a kick away from the blow.
    applyHitFeel(enemy, dealt, angle, isCrit);
    Neo.spawnDamagePopup(enemy.x, enemy.y - 14, dealt, {
      crit: isCrit,
      enemy,
    });
    // Tutorial crit lesson: advances on the first player crit. signal() is a
    // no-op when the tutorial isn't active, so this is free in real runs.
    if (isCrit) Neo.tutorialController?.signal?.('crit-dealt');
    // Multi-beam callers (Thorn's fan) roll drain per beam themselves; skip the
    // shared roll so the beam that also lands the dedup'd hit isn't counted twice.
    if (!options.skipDrainRoll) rollToothOfThornDrain(enemy, stats, Number(options.drainChanceBonus || 0), options.melee === true);
    if (elBartoAmbush) {
      Neo.player.elBartoAmbushReady = false;
      applyBleed(enemy, 1, 4.5);
      applyPoison(enemy, 1, 4.5);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 22, life: 0.6, text: 'AMBUSH', c: '#ffb37a' });
    }
    if (stats.confuseRayStunChance > 0) {
      const rolled = rollProcEffect(stats.confuseRayStunChance);
      if (Neo.nextRandom('encounter') < rolled.chance) {
        enemy.stun = Math.max(Number(enemy.stun || 0), 0.55 * rolled.multiplier);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STUN', c: '#ffe66d' });
        Neo.ringBurst(enemy.x, enemy.y, enemy.r + 12, '#ffe66d', 0.28);
      }
    }
    // Confuse Ray can also make the enemy think the player turned invisible: it
    // enters the shared lost-sight state (? mark + wander, no attacks) for a beat.
    // Skip the god/boss types that ignore the hidden-player blind entirely.
    if (stats.confuseRayBlindChance > 0 && enemy.type !== 'god' && Neo.nextRandom('encounter') < stats.confuseRayBlindChance) {
      enemy.confusedBlindUntil = Math.max(Number(enemy.confusedBlindUntil || 0), Number(Neo.gameElapsedTime || 0) + 1.6);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: '?!', c: '#67d8ff' });
      Neo.ringBurst(enemy.x, enemy.y, enemy.r + 12, '#67d8ff', 0.28);
    }
    // Snake Knife poisons on ANY hit (melee or ranged), so it lives on the shared
    // hit path rather than inside individual melee moves.
    rollAndApplyStatus(enemy, 'poison', stats.snakeKnifePoisonChance, 1, 4, applyPoison);
    // Weapon Fatigue chills on ANY hit too: a slow stack, plus a smaller chance to
    // briefly freeze (hard stun) the target solid.
    rollAndApplyStatus(enemy, 'slow', stats.weaponFatigueChance, 1, 4, (target, stacks, duration) => Neo.applyStatus(target, 'slow', stacks, duration));
    if (stats.weaponFatigueFreezeChance > 0) {
      const rolled = rollProcEffect(stats.weaponFatigueFreezeChance);
      if (Neo.nextRandom('encounter') < rolled.chance) {
        enemy.stun = Math.max(Number(enemy.stun || 0), 0.6 * rolled.multiplier);
        Neo.applyStatus(enemy, 'slow', 1, 4 * rolled.multiplier);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'FROZEN', c: '#9fe8ff' });
        Neo.ringBurst(enemy.x, enemy.y, enemy.r + 12, '#9fe8ff', 0.3);
      }
    }
    if (stats.overstimulateStunChance > 0 && (Neo.getActiveStatusCount?.(enemy) || 0) >= 2) {
      const rolled = rollProcEffect(stats.overstimulateStunChance);
      if (Neo.nextRandom('encounter') < rolled.chance) {
        enemy.stun = Math.max(Number(enemy.stun || 0), 1.4 * rolled.multiplier);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.5, text: 'STIMULATED', c: '#ffd27d' });
        Neo.ringBurst(enemy.x, enemy.y, enemy.r + 12, '#ffd27d', 0.28);
      }
    }
    if (options.lightning && Neo.getStatusStacks?.(enemy, 'slow') > 0 && Neo.nextRandom('encounter') < 0.35) {
      enemy.stun = Math.max(Number(enemy.stun || 0), 0.62);
      Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.48, text: 'SHOCK', c: '#9adfff' });
    }
    // Every lightning hit builds a Static charge on the target — one stack per
    // hit (it stacks well), refreshing the duration. The DoT and the arc to
    // nearby foes are handled in updateEnemyStatuses. Copper Penny stacks add
    // bonus damage (above) plus extra Static stacks per hit on top of the base.
    if (options.lightning && !options.noStatic) {
      applyStatic(enemy, 1 + copperPennyStacks, 4);
    }
    window.achievementEvents?.emit('damage:dealt', { amount: dealt });
    rollAndApplyStatus(enemy, 'bleed', options.bleedChance, Number(options.bleedStacks || 1), Number(options.bleedDuration || 4), applyBleed);
    rollAndApplyStatus(enemy, 'fire', options.fireChance, Number(options.fireStacks || 1), Number(options.fireDuration || 2.8), applyFire);
    if (options.chainLightningRadius > 0) {
      const chained = Neo.findNearestEnemy(enemy.x, enemy.y, options.chainLightningRadius, new Set([enemy]));
      if (chained) {
        hitEnemy(
          chained,
          Math.max(1, Math.round(dealt * Number(options.chainMultiplier || 0.6))),
          Neo.angleBetween(enemy, chained),
          Math.max(60, knockback * 0.5),
          '#9ad9ff',
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
      hitEnemy(nextEnemy, chainDamage, Neo.angleBetween(source, nextEnemy), 55, color, { beamFx: true });
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
      Neo.ringBurst(entity.x, entity.y, entity.r + 18, '#ffb35c', 0.24);
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

  // Elite "power" procs: when an elite (Enflamed/Gross/Breezy) lands any damage
  // on the player, roll each aggregated proc chance and apply the matching
  // status. Called from damagePlayer/tickEnemyBeam/projectile collision so it
  // covers melee, beams and projectiles uniformly. Cold is the player's 'slow'
  // status (the same brittle stack that scales their damage taken).
  function applyEliteProcsToPlayer(enemy) {
    const procs = enemy?.eliteProcs;
    if (!procs || !Neo.player) return;
    const applyPlayerStatusProc = (key, chance, stacks, duration, applyFn) => {
      if (!(chance > 0)) return;
      const rawChance = Neo.getPlayerNegativeStatusProcChance?.(chance) ?? Number(chance || 0);
      const rolled = Neo.applyProcRollback?.(rawChance, 1) || { procChance: rawChance, effectMultiplier: 1 };
      const procChance = Neo.clamp(Number(rolled.procChance || 0), 0, 0.999);
      const effectMultiplier = Math.max(1, Number(rolled.effectMultiplier || 1));
      if (Neo.nextRandom('encounter') >= procChance) return;
      applyFn(Neo.player, stacks, duration * effectMultiplier, enemy.type);
      const state = Neo.getStatusState?.(Neo.player, key);
      if (state && effectMultiplier > 1) state.damageMultiplier = Math.max(Number(state.damageMultiplier || 1), effectMultiplier);
    };
    applyPlayerStatusProc('fire', procs.fire, 1, 2.8, applyFire);
    applyPlayerStatusProc('poison', procs.poison, 1, 4.2, applyPoison);
    applyPlayerStatusProc('slow', procs.cold, 1, 4, (target, stacks, duration, source) => Neo.applyStatus(target, 'slow', stacks, duration, source));
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
    Neo.ringBurst(enemy.x, enemy.y, enemy.r + 12, '#9fe8ff', 0.3);
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
      Neo.ringBurst(source.x, source.y, source.r + 22, '#9be25a', 0.3);
      Neo.spawnParticle({ x: source.x, y: source.y - source.r - 14, life: 0.4, text: 'SPREAD', c: '#cdf58f' });
    }
  }

  function spawnBleedSpray(enemy, stacks = 1, intensity = 1) {
    if (!enemy || enemy.type === 'golem' || enemy.type === 'bulk_golem') return;
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
      const statusDamageMultiplier = Math.max(1, Number(state.damageMultiplier || 1));
      let damage = scaleRawDamageAgainstEnemy(enemy, Math.max(1, Math.round(config.damage(state.stacks, stats) * statusDamageMultiplier)));
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
    Neo.ringBurst(target.x, target.y, target.r + 8, Neo.STATUS_STYLES.static.color, 0.2);
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
    const targetAngle = Neo.angleBetween(enemy, Neo.player) + Number(enemy.beamAimBias || 0);
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
        Neo.damagePlayer(damage, hitSegment.angle, knockback, source.label, { sourceKey: source.key, attacker: enemy });
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
      base = Neo.angleBetween(Neo.player, enemy);
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
      leavesBloodPool: enemy.type !== 'golem' && enemy.type !== 'bulk_golem',
      bloodColor: enemy.type === 'golem' || enemy.type === 'bulk_golem'
        ? ''
        : enemy.type === 'god'
          ? '#f2ecff'
          : enemy.elite
            ? '#c04a14'
            : '#8d0018',
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

  // Sarge's Hammer double-kill reward. Spawns a homing hammer aimed at the kill
  // spot. Phase 1 ('out') seeks the nearest enemy; on its first enemy hit the
  // projectile flips to phase 2 ('back') and homes to the player (handled in
  // world.js updateProjectiles), healing and pulling pickups when it arrives.
  function launchSargesHammer(originX, originY) {
    if (!Neo.player) return;
    const damage = Math.max(1, Math.round(getPlayerBaseDamage() * 1.4));
    const angle = Math.atan2((originY ?? Neo.player.y) - Neo.player.y, (originX ?? Neo.player.x) - Neo.player.x);
    Neo.spawnProjectile({
      x: Neo.player.x,
      y: Neo.player.y,
      vx: Math.cos(angle) * 620,
      vy: Math.sin(angle) * 620,
      r: 11,
      life: 6,
      enemy: false,
      kind: 'sarges_hammer',
      damage,
      knockback: 320,
      color: '#7da3ff',
      homing: true,
      homingTarget: 'enemy',
      homingRadius: 1100,
      homingSpeed: 900,
      homingAccel: 3.2,
      homingTurnRate: 4.2,
      // Pierce so a thrown hammer can clip a couple of foes before it returns.
      pierceCount: 1,
      boomerang: true,
      boomerangPhase: 'out',
    });
    Neo.ringBurst?.(Neo.player.x, Neo.player.y, 30, '#9bb8ff', 0.45);
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 30, life: 0.7, text: 'DOUBLE!', c: '#9bb8ff' });
    Neo.playSfx?.('sword_swing');
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
    if (!options.forceDeath && Neo.handleBountyTargetLethal?.(enemy)) return;
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
    if (isTutorialDummy) Neo.tutorialController?.signal?.('enemy-killed', { tutorialDummy: true });
    spawnEnemyCorpse(enemy);
    const itemStats = Neo.getItemStats();
    const deathBleedStacks = Neo.getStatusStacks(enemy, 'bleed');
    if (itemStats.bleedSplashStacks > 0 && deathBleedStacks > 0) {
      const splashRadius = 92 + Math.min(70, deathBleedStacks * 8);
      Neo.applyStatusInRadius(enemy.x, enemy.y, splashRadius, 'bleed', itemStats.bleedSplashStacks, 4.5, enemy);
      Neo.ringBurst(enemy.x, enemy.y, splashRadius, '#ff4f6d', 0.36);
    }
    if (Neo.player) Neo.player.kills = Math.max(0, Number(Neo.player.kills || 0)) + 1;
    Neo.notifyBountyEnemyKilled?.(enemy);
    window.achievementEvents?.emit('enemy:killed');
    // Sarge's Hammer: 2 kills within 1 second launch a homing hammer that strikes a
    // foe, then returns to Sarge — healing and pulling pickups on the way back. A
    // short re-arm window keeps big AoE clears from spamming a swarm of hammers.
    if (!isTutorialDummy && Neo.player && Neo.player.equippedWeapon === 'sarges_hammer') {
      const now = performance.now() / 1000;
      const lastKillAt = Number(Neo.player.sargesHammerLastKillAt || 0);
      const rearmUntil = Number(Neo.player.sargesHammerRearmAt || 0);
      if (lastKillAt > 0 && now - lastKillAt <= 1 && now >= rearmUntil) {
        launchSargesHammer(enemy.x, enemy.y);
        Neo.player.sargesHammerRearmAt = now + 0.5;
        Neo.player.sargesHammerLastKillAt = 0; // consume the pair
      } else {
        Neo.player.sargesHammerLastKillAt = now;
      }
    }
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
        ttl: 2.5,
        pushPower: 340 * moveSpeed,
        damageTakenMultiplier: itemStats.graveZoneDamageTakenMultiplier || 1,
        moveSpeed,
        source: 'grave_zone',
      });
      Neo.ringBurst(graveX, graveY, graveRadius, '#c9b3ff', 0.45);

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
        c: enemy.type === 'golem' || enemy.type === 'bulk_golem'
          ? (enemy.type === 'bulk_golem' ? '#8a735d' : '#777b80')
          : enemy.elite
            ? '#b97333'
            : enemy.type === 'god'
              ? '#f2ecff'
              : '#7b1a22',
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
    // Metao's floor curse (reducePotions): chokes the potion supply by 60%.
    const potionDropChance = 0.1 * (Neo.floorRivalCurses?.reducePotions ? 0.4 : 1);
    if (enemy.rivalTurret) {
      // Gelleh's turrets drop a potion 50% of the time and nothing else.
      if (enemyLootRandom() < 0.5) Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'potion' });
    } else if (!isTutorialDummy && enemy.type !== 'rival' && enemy.elite && enemyLootRandom() < eliteItemDropChance) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ elite: true, random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemy.type !== 'rival' && !enemy.elite && normalItemDropChance > 0 && enemyLootRandom() < normalItemDropChance) {
      Neo.pickups.push({ x: enemy.x, y: enemy.y, type: 'item', key: rollItemDrop({ random: enemyLootRandom }) });
    } else if (!isTutorialDummy && enemyLootRandom() < potionDropChance) {
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

    if (!isTutorialDummy
      && !options.forceDeath
      && Neo.gameMode !== 'practice'
      && !Neo.isChallengeActive?.('no_items')
      && Neo.isBossType(enemy.type)
      && enemyLootRandom() < FORGE_VOUCHER_BOSS_DROP_CHANCE) {
      const key = Neo.FORGE_VOUCHER_KEY || 'forge_voucher';
      if (Neo.ITEM_DEFS?.[key]) {
        Neo.pickups.push({ x: enemy.x - 28, y: enemy.y, type: 'item', key });
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 18, life: 0.9, text: 'FORGE VOUCHER', c: '#ffcf76' });
      }

      // Alongside the voucher, a boss has a 12% chance to also drop a god item.
      if (enemyLootRandom() < GOD_ITEM_BOSS_DROP_CHANCE) {
        if (!Neo.godItemKeysCache) {
          Neo.godItemKeysCache = Neo.ITEM_KEYS.filter(k => (
            Neo.isGodTier?.(Neo.ITEM_DEFS[k]?.rarity) && !Neo.ITEM_DEFS[k]?.voucher
          ));
        }
        const godKeys = Neo.godItemKeysCache;
        if (godKeys.length) {
          const godKey = godKeys[Math.floor(enemyLootRandom() * godKeys.length)];
          Neo.pickups.push({ x: enemy.x + 28, y: enemy.y, type: 'item', key: godKey });
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - enemy.r - 36, life: 1.1, text: 'GOD ITEM!', c: '#ffd24a' });
        }
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
        Neo.recordCharacterUnlock?.('mooggy');
      } else {
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 28, life: 1.5, text: `MOOGGY ${defeats}/3`, c: '#ff3348' });
      }
      Neo.persistMetaSoon();
      Neo.refreshMenuState();
    }

    if (enemy.type === 'god') {
      Neo.metaProgress.godsKilled = Number(Neo.metaProgress.godsKilled || 0) + 1;
      window.achievementEvents?.emit('god:killed');
      if (!Neo.metaProgress.unlockedCharacters.includes('gelleh')) {
        Neo.metaProgress.unlockedCharacters.push('gelleh');
        Neo.recordCharacterUnlock?.('gelleh');
      }
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
      Neo.metaProgress.bowmanBaneDefeats = Number(Neo.metaProgress.bowmanBaneDefeats || 0) + 1;
      if (!Neo.metaProgress.unlockedCharacters.includes('sarge')) {
        Neo.metaProgress.unlockedCharacters.push('sarge');
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 60, life: 2.2, text: 'SARGE UNLOCKED!', c: '#ffd24a' });
        Neo.recordCharacterUnlock?.('sarge');
      }
      Neo.persistMetaSoon();
      Neo.refreshMenuState();
      Neo.updateObjective();
      Neo.scheduleRunSave();
    }

    if (enemy.type === 'rival' && Neo.gameMode === 'rival_rumble') {
      const rival = enemy.rivalData;
      if (rival) {
        rival.dead = true;
        window.achievementEvents?.emit('rival:killed');
        dropCoins(enemy.x, enemy.y, 18 + Neo.rivalRumbleStage * 6);
        Neo.spawnParticle({ x: enemy.x, y: enemy.y - 26, life: 2.0, text: `${rival.name.toUpperCase()} DEFEATED!`, c: rival.color });
        Neo.sayAtPosition(enemy.x, enemy.y, rival.deathLine, { speaker: rival.name, tone: 'boss', holdTime: 1.8, offsetY: enemy.r + 36 });
        grantXp(20 + Neo.rivalRumbleStage * 5);
      }
      Neo.onRivalRumbleRivalDefeated();
      return;
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
        // Every rival's death arms its signature floor curse on the next floor
        // (e.g. Mooggy's blood thorns, Princess's clouded map). An alive descent
        // arms a slightly stronger version in spawnRivals.
        Neo.queueRivalCurse?.(rival.characterKey, { descended: false });
        const stolenLoot = Array.isArray(rival.loot) ? rival.loot : [];
        const finalDeath = rival.lives <= 0;
        if (finalDeath) {
          if (rival.brain) rival.brain.lastOutcome = 'Slain by the player';
          if (rival.memory) rival.memory.lastOutcome = 'Slain by the player';
          // The large item windfall belongs to the surviving rivals. A final
          // kill gives the player one relic instead of spilling the full pack.
          dropFinalRivalRelic(enemy);
          if (!Array.isArray(Neo.slainRivalKeys)) Neo.slainRivalKeys = [];
          if (!Neo.slainRivalKeys.includes(rival.characterKey)) Neo.slainRivalKeys.push(rival.characterKey);
          Neo.spawnParticle({ x: enemy.x, y: enemy.y - 44, life: 2.2, text: 'SLAIN FOR GOOD', c: '#9fd0ff' });
        } else {
          if (rival.brain) rival.brain.lastOutcome = 'Defeated and preparing a return';
          if (rival.memory) rival.memory.lastOutcome = 'Defeated and preparing a return';
          // Extra life spent: they escape with their pack and return on a
          // later floor with double max HP (and god gear if the relationship
          // went negative).
          Neo.prepareRivalReturn?.(rival);
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
        if (Neo.currentRoom.type === 'boss') Neo.playSfx?.('victory');
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
    const normalizeRarity = (rarity) => {
      const value = String(rarity || 'knight').toLowerCase();
      if (value === 'white') return 'knight';
      if (value === 'purple') return 'wizard';
      if (value === 'yellow' || value === 'red') return 'god';
      return value;
    };
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
    const allowedRarities = Array.isArray(options.rarities) && options.rarities.length
      ? new Set(options.rarities.map(normalizeRarity))
      : null;
    const excludedKeys = new Set(Array.isArray(options.excludeKeys) ? options.excludeKeys : []);
    const rarityWeights = options.elite
      ? Neo.ELITE_ITEM_RARITY_DROP_WEIGHTS
      : Neo.ITEM_RARITY_DROP_WEIGHTS;
    const sandbox = Neo.getActiveSandboxSettings();
    const entries = adjustEntriesForScrollControl(Neo.ITEM_DROP_WEIGHTS.filter(([key, weight]) => {
      if (Math.max(0, Number(weight) || 0) <= 0 || excludedKeys.has(key)) return false;
      if (sandbox && !sandbox.allowedItems.includes(key)) return false;
      const rarity = normalizeRarity(Neo.ITEM_DEFS?.[key]?.rarity);
      return !allowedRarities || allowedRarities.has(rarity);
    }));
    if (!entries.length) return '';

    const entriesByRarity = new Map();
    entries.forEach((entry) => {
      const rarity = normalizeRarity(Neo.ITEM_DEFS?.[entry[0]]?.rarity);
      if (!entriesByRarity.has(rarity)) entriesByRarity.set(rarity, []);
      entriesByRarity.get(rarity).push(entry);
    });
    const availableRarityEntries = Object.entries(rarityWeights || {})
      .map(([rarity, weight]) => [normalizeRarity(rarity), weight])
      .filter(([rarity, weight]) => entriesByRarity.has(rarity) && Number(weight) > 0);
    const rolledRarity = Neo.rollFromWeightTable(
      Neo.buildWeightTable(availableRarityEntries),
      options.stream || 'loot',
      options.random
    );
    const rarityEntries = entriesByRarity.get(rolledRarity) || entries;
    const rolled = Neo.rollFromWeightTable(
      Neo.buildWeightTable(rarityEntries),
      options.stream || 'loot',
      options.random
    );
    return applyScrollReplacement(rolled);
  }

  function grantXp(amount) {
    const stats = Neo.getItemStats();
    // Small time bonus: +5% XP for every 5 minutes survived this run, so longer
    // runs stay worth grinding even though base kill XP is flat.
    const timeScale = 1 + Math.floor(Math.max(0, Number(Neo.gameElapsedTime || 0)) / 300) * 0.05;
    const gained = Math.max(1, Math.round(amount * Neo.getRunDifficultyScalars().xpRewardMultiplier * (stats.xpGainMultiplier || 1) * timeScale));
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
    applyLevelMilestone(Neo.player.level);
    Neo.markInventoryPanelDirty();
    Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 20, life: 0.9, text: `LV ${Neo.player.level}`, c: '#7dff9e' });
  }

  // Apply a level milestone's one-time stat bump (on top of the normal per-level
  // gains) and surface feedback. Move-charge milestones are read live by
  // getMoveMaxStacks/tickCooldowns — this just announces them. moveSpeed feeds
  // getItemStats().moveSpeedMultiplier, so no field write is needed here either.
  function applyLevelMilestone(level) {
    const milestone = Neo.getLevelMilestone(level, Neo.player?.character || Neo.chosenCharacter);
    if (!milestone) return;
    const stat = milestone.stat || {};
    if (stat.maxHp) {
      Neo.player.maxHp += stat.maxHp;
      Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + stat.maxHp);
    }
    if (stat.attackPower) Neo.player.attackPower += stat.attackPower;
    if (stat.attackSpeed) Neo.player.attackSpeed += stat.attackSpeed;
    if (milestone.label) {
      Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 46, life: 1, text: milestone.label, c: '#cfd7ff' });
    }
  }

  function applyArtificerChargerPickup(previousCount, collectCount) {
    if (!Neo.player || previousCount + collectCount <= 0) return;
    if (previousCount > 0) {
      // A duplicate charger burns 1 Loop Crystal to contain the overcharge.
      // With no crystals to spend, the duplicate simply does nothing.
      const crystals = Math.max(0, Math.floor(Number(Neo.metaProgress?.loopCrystals || 0)));
      if (crystals > 0) {
        Neo.metaProgress.loopCrystals = crystals - 1;
        Neo.persistMetaSoon();
        Neo.spawnParticle({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.2, text: 'OVERCHARGE CONTAINED: -1 LOOP CRYSTAL', c: '#58b7ff' });
      }
      return;
    }

    const startLevel = Math.max(1, Math.floor(Number(Neo.player.level) || 1));
    const levelsGained = startLevel;
    const gains = Neo.getArtificerLevelGains(1);
    for (let index = 0; index < levelsGained; index += 1) {
      Neo.player.xpToNext = Math.round(Neo.player.xpToNext * 1.22);
    }
    Neo.player.level += levelsGained;
    Neo.player.maxHp += gains.maxHp * levelsGained;
    Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + gains.maxHp * levelsGained);
    Neo.player.attackPower += gains.attackPower * levelsGained;
    Neo.player.attackSpeed += gains.attackSpeed * levelsGained;
    // Doubling the level can vault past milestone boundaries — apply each one
    // crossed so charge/stat/speed gains aren't silently skipped.
    for (let lvl = startLevel + 1; lvl <= Neo.player.level; lvl += 1) {
      applyLevelMilestone(lvl);
    }
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
    Neo.pushReadyNotification('robot_arm');
  }

  function canDuplicateItemPickup(itemKey) {
    return itemKey !== 'artificer_charger';
  }

  // Paul Cunt's House Keys (GREEN, lies in its tooltip): really lets the player
  // reach out and strike a rival once per floor from the inventory Rivals tab.
  // Returns true when a strike landed (so the UI can refresh + report).
  function canUseHouseKeysStrike() {
    if ((Neo.getItemCount?.('paul_cunts_house_keys') || 0) <= 0) return false;
    return Number(Neo.player?.houseKeysStrikeFloor ?? -1) !== Number(Neo.floor);
  }

  function useHouseKeysStrike(rivalId) {
    if (!canUseHouseKeysStrike()) return false;
    const stacks = Neo.getItemCount?.('paul_cunts_house_keys') || 0;
    const rival = (Neo.rivals || []).find(r => r && !r.dead && !r.friend && String(r.rivalId) === String(rivalId));
    if (!rival) return false;
    // 35% of the rival's max HP per stack — a remote chip, not a guaranteed kill.
    const damage = Math.max(1, Math.round(Number(rival.max || rival.hp || 1) * 0.35 * stacks));
    if (Neo.player) Neo.player.houseKeysStrikeFloor = Number(Neo.floor);
    Neo.playSfx?.('coin');
    // If the rival is physically present in the room, route through the normal
    // damage pipeline so death/lives/curses all resolve exactly as a melee kill.
    const liveEnemy = (Neo.enemies || []).find(e => e?.type === 'rival' && e.rivalData === rival && !e.dead);
    if (liveEnemy) {
      hitEnemy(liveEnemy, damage, Neo.rng() * Math.PI * 2, 6, '#3ef07a', { source: 'house_keys' });
      Neo.spawnParticle?.({ x: liveEnemy.x, y: liveEnemy.y - 40, life: 1.4, text: 'STRUCK FROM AFAR', c: '#3ef07a' });
      Neo.markInventoryPanelDirty?.();
      return true;
    }
    // Off-screen rival: chip its persistent HP record. If it would drop, the rival
    // flees wounded — spend a life and queue a return (or slay on the last life)
    // without the in-room death FX, mirroring the lives bookkeeping in hitEnemy.
    rival.hp = Math.max(0, Number(rival.hp || rival.max || 1) - damage);
    rival.hpSnapshot = rival.hp;
    rival.relationship = Number(rival.relationship || 0) - 1; // long-distance grudge
    if (rival.hp <= 0) {
      rival.lives = Math.max(0, Number(rival.lives ?? 2) - 1);
      Neo.queueRivalCurse?.(rival.characterKey, { descended: false });
      if (rival.lives <= 0) {
        if (rival.brain) rival.brain.lastOutcome = 'Slain from afar';
        if (rival.memory) rival.memory.lastOutcome = 'Slain from afar';
        rival.dead = true;
        if (!Array.isArray(Neo.slainRivalKeys)) Neo.slainRivalKeys = [];
        if (!Neo.slainRivalKeys.includes(rival.characterKey)) Neo.slainRivalKeys.push(rival.characterKey);
        Neo.rivals = (Neo.rivals || []).filter(r => r !== rival);
      } else {
        rival.dead = true;
        if (rival.brain) rival.brain.lastOutcome = 'Driven off from afar';
        if (rival.memory) rival.memory.lastOutcome = 'Driven off from afar';
        Neo.prepareRivalReturn?.(rival);
        Neo.pendingRivalReturns = Array.isArray(Neo.pendingRivalReturns) ? Neo.pendingRivalReturns : [];
        Neo.pendingRivalReturns.push({
          returnFloor: Number(Neo.floor) + 1,
          rival: { ...rival, dead: false, hp: rival.max, hpSnapshot: rival.max },
        });
        Neo.rivals = (Neo.rivals || []).filter(r => r !== rival);
      }
    }
    Neo.spawnParticle?.({
      x: Neo.player?.x ?? Neo.ROOM_W / 2,
      y: (Neo.player?.y ?? Neo.ROOM_H / 2) - 30,
      life: 1.4,
      text: rival.hp <= 0 ? `${rival.name.toUpperCase()} ROUTED` : `${rival.name.toUpperCase()} STRUCK`,
      c: '#3ef07a',
    });
    Neo.scheduleRunSave?.();
    Neo.markInventoryPanelDirty?.();
    return true;
  }

  // Per-item pickup side effects, keyed by item key. Each handler runs after the
  // generic collection (inventory bump, equipment slots, notifications) with a
  // context { collectCount, previousCount }. Items with no special behavior have
  // no row. ITEM_PICKUP_PREDICATES handles the cases that match a predicate rather
  // than an exact key (e.g. any scroll-control item). Adding pickup behavior for a
  // new item is one row here instead of another branch inside collectItem.
  function applyTitanHeartPickup(collectCount) {
    for (let index = 0; index < collectCount; index += 1) {
      Neo.player.maxHp = Math.max(120, Math.round(Neo.player.maxHp * 1.08));
      Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Neo.player.hp * 1.08));
    }
  }

  function applyVeggysPendantPickup(collectCount) {
    for (let index = 0; index < collectCount; index += 1) {
      const oldMax = Number(Neo.player.maxHp || 0);
      Neo.player.maxHp = Math.max(1, Math.round(oldMax * 1.04));
      Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Number(Neo.player.hp || 0) + (Neo.player.maxHp - oldMax)));
    }
  }

  // Foley's Irish NewYork Charm (GREEN, lies in its tooltip): really just +15 max
  // HP per stack (granted + healed on pickup, like titan_heart) and +1 on-hit
  // damage per stack (applied in getPlayerBaseDamage's flat on-hit bonus).
  function applyFoleyCharmPickup(collectCount) {
    const gain = 15 * Math.max(1, Number(collectCount) || 1);
    Neo.player.maxHp = Math.max(1, Math.round(Number(Neo.player.maxHp || 0) + gain));
    Neo.player.hp = Math.min(Neo.player.maxHp, Math.round(Number(Neo.player.hp || 0) + gain));
  }

  function applyJestersDicePickup(collectCount) {
    Neo.floorSkipPending += 3 * collectCount;
    const bonusItemCounts = {};
    for (let index = 0; index < 10 * collectCount; index += 1) {
      const key = Neo.rollItemDrop({ excludeKeys: ['jesters_dice'] });
      if (!key) continue;
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
  }

  // EARLY-phase handlers run before notifications fire (they grant crystals or
  // prime charge state that later UI reads). LATE-phase handlers run after, and
  // the late ones are mutually exclusive per item — exactly matching the original
  // if/else-if ordering. titan_heart is intentionally LATE and independent.
  const EARLY_ITEM_PICKUP_HANDLERS = {
    artificer_charger: ({ previousCount, collectCount }) => applyArtificerChargerPickup(previousCount, collectCount),
    rich_mans_blues: ({ collectCount }) => grantRichMansBluesPickupCrystals(collectCount),
  };

  const LATE_ITEM_PICKUP_HANDLERS = {
    jesters_dice: ({ collectCount }) => applyJestersDicePickup(collectCount),
    wizards_paw: ({ collectCount }) => {
      for (let index = 0; index < collectCount; index += 1) Neo.openWizardPawSelection();
    },
    extra_battery: ({ collectCount }) => {
      for (let index = 0; index < collectCount; index += 1) Neo.openExtraBatterySelection();
    },
    titan_heart: ({ collectCount }) => applyTitanHeartPickup(collectCount),
    veggys_pendant: ({ collectCount }) => applyVeggysPendantPickup(collectCount),
    foleys_irish_newyork_charm: ({ collectCount }) => applyFoleyCharmPickup(collectCount),
  };

  // Predicate-matched LATE handlers: run when match(itemKey) is true and the item
  // has no exact-key late handler. Used for families of items (e.g. scrolls).
  const LATE_ITEM_PICKUP_PREDICATES = [
    {
      // Scrolls resolve their selection popup on acquisition (pickup/buy/reward),
      // not as an activatable tool. Queue one prompt per copy collected.
      match: (itemKey) => Neo.isScrollControlItem?.(itemKey),
      run: (itemKey, { collectCount }) => Neo.enqueueScrollSelection?.(itemKey, collectCount),
    },
  ];

  function runEarlyItemPickupHandlers(itemKey, ctx) {
    EARLY_ITEM_PICKUP_HANDLERS[itemKey]?.(ctx);
  }

  function runLateItemPickupHandlers(itemKey, ctx) {
    const handler = LATE_ITEM_PICKUP_HANDLERS[itemKey];
    if (handler) {
      handler(ctx);
      return;
    }
    const predicate = LATE_ITEM_PICKUP_PREDICATES.find(entry => entry.match(itemKey));
    if (predicate) predicate.run(itemKey, ctx);
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
    // Early pickup effects that must run before notifications (crystals/charge state).
    runEarlyItemPickupHandlers(itemKey, { previousCount, collectCount });
    if (Neo.isFirstRunTutorialActive()) Neo.tutorialState.gotRelic = true;
    Neo.addToEquipmentSlots?.(itemKey);
    Neo.markInventoryPanelDirty();
    if ((Neo.VOUCHER_KEYS || []).includes(itemKey)) Neo.refreshShopVoucherBanner?.(itemKey);
    Neo.pushItemNotification(itemKey, collectCount);
    // The bonus copy from a duplicate roll gets its own compact status toast,
    // so the pickup card above stays a clean "new item" card rather than
    // conflating "Copied!" into the item's description.
    if (duplicatePickup) Neo.pushCopiedNotification(itemKey);
    const totalItems = Object.values(Neo.player.items).reduce((s, v) => s + Number(v || 0), 0);
    window.achievementEvents?.emit('item:collected', { totalItems });

    runLateItemPickupHandlers(itemKey, { previousCount, collectCount });

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
  Neo.getDisplayDamage = getDisplayDamage;
  Neo.formatDisplayDamage = formatDisplayDamage;
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
  Neo.castPrincessShield = castPrincessShield;
  Neo.updatePrincessShieldAutoTrigger = updatePrincessShieldAutoTrigger;
  Neo.applyResponsiveVelocity = applyResponsiveVelocity;
  Neo.spawnPlayerDiskBurst = spawnPlayerDiskBurst;
  Neo.spawnFireballs = spawnFireballs;
  Neo.castChaosBurst = castChaosBurst;
  Neo.spawnChaosBlast = spawnChaosBlast;
  Neo.castBladeOfJustice = castBladeOfJustice;
  Neo.updateJusticeBlades = updateJusticeBlades;
  Neo.castTitanHammer = castTitanHammer;
  Neo.updateTitanHammer = updateTitanHammer;
  Neo.updateSkySwords = updateSkySwords;
  Neo.castSmiteChain = castSmiteChain;
  Neo.findNearestSmiteTarget = findNearestSmiteTarget;
  Neo.castHealingZone = castHealingZone;
  Neo.updateHealingZoneCharge = updateHealingZoneCharge;
  Neo.HEALING_ZONE_MAX_CHARGE = HEALING_ZONE_MAX_CHARGE;
  Neo.HEALING_ZONE_CHARGE_SPEED_MULTIPLIER = HEALING_ZONE_CHARGE_SPEED_MULTIPLIER;
  Neo.castDeathBall = castDeathBall;
  Neo.updateDeathBallCharge = updateDeathBallCharge;
  Neo.updateNimrodStompCharge = updateNimrodStompCharge;
  Neo.updateLoveBombCharge = updateLoveBombCharge;
  Neo.castGhostBall = castGhostBall;
  Neo.updateGhostBallCharge = updateGhostBallCharge;
  Neo.updateGhostBalls = updateGhostBalls;
  Neo.NIMROD_STOMP_MAX_CHARGE = NIMROD_STOMP_MAX_CHARGE;
  Neo.DEATH_BALL_MAX_CHARGE = DEATH_BALL_MAX_CHARGE;
  Neo.LOVE_BOMB_MAX_CHARGE = LOVE_BOMB_MAX_CHARGE;
  Neo.GHOST_BALL_MAX_CHARGE = GHOST_BALL_MAX_CHARGE;
  Neo.spawnChargeMotes = spawnChargeMotes;
  Neo.TURTLE_POWERUP_CHARGE_SPEED_MULTIPLIER = TURTLE_POWERUP_CHARGE_SPEED_MULTIPLIER;
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
  Neo.applyEliteProcsToPlayer = applyEliteProcsToPlayer;
  Neo.applyDarkDrain = applyDarkDrain;
  Neo.applyStatusInRadius = applyStatusInRadius;
  Neo.procyPickleSpread = procyPickleSpread;
  Neo.spawnBleedSpray = spawnBleedSpray;
  Neo.migrateEnemyState = migrateEnemyState;
  Neo.tickEnemyStatus = tickEnemyStatus;
  Neo.updateEnemyStatuses = updateEnemyStatuses;
  // normalizeAngle is intentionally not exported on Neo: it's only used internally
  // by turnAngleToward in this file.
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
  Neo.canUseHouseKeysStrike = canUseHouseKeysStrike;
  Neo.useHouseKeysStrike = useHouseKeysStrike;
  Neo.updateItemUI = updateItemUI;
