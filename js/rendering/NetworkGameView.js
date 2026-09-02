(function initializeNetworkGameView(root, factory) {
  const api = factory(root);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.rendering = namespace.rendering || {};
  Object.assign(namespace.rendering, api);

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNetworkGameViewApi(root) {
  'use strict';

  const moveContent = typeof require === 'function'
    ? require('../simulation/SharedMoveContent.js')
    : (root.NeoNyke?.content || {});
  const worldContent = typeof require === 'function'
    ? require('../simulation/SharedWorldContent.js')
    : (root.NeoNyke?.content || {});
  const roomInterior = typeof require === 'function'
    ? require('../simulation/SharedRoomInteriorSystem.js')
    : (root.NeoNyke?.simulation || {});
  const movementRules = typeof require === 'function'
    ? require('../simulation/CampaignMovementRules.js')
    : (root.NeoNyke?.simulation || {});
  const runServices = typeof require === 'function'
    ? require('../simulation/SharedRunServiceSystem.js')
    : (root.NeoNyke?.simulation || {});
  const combatSystem = typeof require === 'function'
    ? require('../simulation/NetworkCombatSystem.js')
    : (root.NeoNyke?.simulation || {});
  const projectilePolicies = typeof require === 'function'
    ? require('../simulation/SharedProjectileSystem.js')
    : (root.NeoNyke?.simulation || {});
  const dashPolicies = typeof require === 'function'
    ? require('../simulation/SharedDashSystem.js')
    : (root.NeoNyke?.simulation || {});
  const moveEffects = typeof require === 'function'
    ? require('../simulation/SharedMoveEffectSystem.js')
    : (root.NeoNyke?.simulation || {});
  const forgePolicies = typeof require === 'function'
    ? require('../simulation/SharedForgeSystem.js')
    : (root.NeoNyke?.content || {});
  const CAMPAIGN_ROOM_GEOMETRY = worldContent.CAMPAIGN_ROOM_GEOMETRY;
  const CAMPAIGN_PLAYER_RADIUS = Number(worldContent.CAMPAIGN_PLAYER_RADIUS || 14);

  const INPUT_INTERVAL_MS = 50;
  const INPUT_AIM_SEND_INTERVAL_MS = 100;
  // Refresh unchanged intent often enough that a lost direction change or
  // button release cannot leave the authority applying stale input for a full
  // second. Four tiny samples per second are negligible beside snapshots.
  const INPUT_HEARTBEAT_MS = 250;
  // Neutral intent stays on the same sequenced, replaceable input channel as
  // ordinary intent. Bounded retries reduce loss risk without keeping an
  // abandoned room awake indefinitely while input remains suspended.
  const NEUTRAL_INPUT_RETRY_INTERVAL_MS = INPUT_HEARTBEAT_MS;
  const MAX_NEUTRAL_INPUT_SEND_ATTEMPTS = 8;
  const INPUT_VECTOR_EPSILON = 0.01;
  const INPUT_AIM_EPSILON = 0.02;
  const INTERPOLATION_DELAY_MS = 100;
  // The severe congestion cadence is 400 ms. With the 100 ms interpolation
  // buffer, 300 ms of bounded dead reckoning keeps constant-velocity actors
  // continuous across that entire interval instead of freezing and jumping.
  const MAX_REMOTE_EXTRAPOLATION_MS = 300;
  const MAX_SMOOTH_RECONCILIATION_PX = 128;
  const MAX_LOCAL_PREDICTION_CATCH_UP_MS = 250;
  const CAMPAIGN_HUD_LAYER_IDS = Object.freeze([
    'hud', 'hudLower', 'actionBar', 'equipmentSlots', 'playerStats',
    'coinDisplay', 'centerDisplay', 'objectiveTracker', 'entityDialogueLayer',
    'interactPrompt', 'endlessHud', 'bossRushHud', 'practicePanel',
  ]);
  const NETWORK_HUD_DISPLAY_VALUES = Object.freeze({
    coinDisplay: 'flex',
    centerDisplay: '',
    actionBar: '',
    equipmentSlots: '',
    playerStats: '',
  });
  const NETWORK_CONDITIONAL_HUD_LAYER_IDS = Object.freeze([
    'entityDialogueLayer', 'interactPrompt',
  ]);
  const DEFAULT_KEYBOARD_BINDINGS = Object.freeze({
    up: 'w', down: 's', left: 'a', right: 'd', dash: 'shift', inventory: 'i',
    interact: 'e', ascend: ' ', smash: 'r', slash: 'lmb', laser: 'rmb',
    activateAll: ' ', tool1: '1', tool2: '2', tool3: '3', tool4: '4',
    tool5: '5', tool6: '6', tool7: '7', tool8: '8',
  });
  // Matches the touch deadzone the single-player loop uses in js/core/update.js.
  const TOUCH_DEADZONE = 0.08;
  // Matches the default duration triggerArmRecoil() uses in js/game/combat.js.
  const ARM_RECOIL_DURATION = 0.16;
  // The authority simulates player.vx/vy but the protocol never sends them, so
  // networked actors arrive with no velocity at all. Every movement animation in
  // drawActorSprite (footfall bob, squash, lean, shadow, idle breathe) is gated
  // on hypot(vx, vy), so without this heroes slide along in an idle pose. Derive
  // velocity from the interpolated position delta instead of widening the packet
  // -- positions are already on the wire, so sending velocity too is redundant.
  // Smoothed because a single frame's delta is noisy enough to make the step
  // cycle stutter; the rate is a half-life in Hz, framerate-independent.
  const NETWORK_VELOCITY_SMOOTH_HZ = 18;
  const MOVEMENT_KEYS = new Map([
    ['KeyW', [0, -1]], ['ArrowUp', [0, -1]],
    ['KeyS', [0, 1]], ['ArrowDown', [0, 1]],
    ['KeyA', [-1, 0]], ['ArrowLeft', [-1, 0]],
    ['KeyD', [1, 0]], ['ArrowRight', [1, 0]],
  ]);

  function configuredKeyboardBindings() {
    return { ...DEFAULT_KEYBOARD_BINDINGS, ...(root.NeoSettings?.getBindings?.() || {}) };
  }

  function eventKey(event) {
    if (typeof event?.key === 'string') return event.key.toLowerCase();
    if (/^Key[A-Z]$/.test(event?.code || '')) return event.code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(event?.code || '')) return event.code.slice(5);
    if (event?.code === 'Space') return ' ';
    if (event?.code === 'ShiftLeft' || event?.code === 'ShiftRight') return 'shift';
    return '';
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function angularDistance(first, second) {
    return Math.abs(Math.atan2(Math.sin(Number(first || 0) - Number(second || 0)), Math.cos(Number(first || 0) - Number(second || 0))));
  }

  function stableNumericId(value) {
    let hash = 2166136261;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // ── Client-side cosmetics ────────────────────────────────────────────────
  // Colours are pure presentation: the same for every entity of a given type,
  // and identical on every client. They belong here, derived locally from the
  // authoritative type/behaviour, NOT sent over the wire each snapshot. Keeping
  // them client-side saves bandwidth and removes cosmetic work from the server.
  const PLAYER_COLORS = ['#9de9ff', '#d9a7ff', '#ffd98f', '#ff9fcf'];
  const ABILITY_PRESENTATIONS = moveContent.MOVE_PRESENTATION_DEFS || Object.freeze({});
  const MOVE_BASE_STATS = moveContent.MOVE_BASE_STATS || Object.freeze({});
  const CONTINUOUS_BEAM_MOVES = new Set(moveContent.CONTINUOUS_BEAM_MOVES || [
    'blood_beam', 'love_beam', 'turtle_wave', 'holy_eye_beams', 'god_sweep',
    'mooggy_blood_beam', 'thorn_blood_beams', 'wizard_lazer',
  ]);
  const BUTTON_LASER_HELD = 1;
  const BUTTON_SMASH_HELD = 2;
  const BUTTON_DASH_HELD = 4;
  const BUTTON_MELEE_HELD = 8;
  // Combat is authority-owned, but waiting a full round trip before showing an
  // accepted button press makes even a healthy connection feel broken. Keep a
  // short client-only presentation record until its authoritative event arrives
  // (or it naturally expires if the action was rejected).
  const PREDICTED_COMBAT_CONFIRMATION_MS = 1200;
  // Audio can arrive behind reliable combat traffic. Beyond this age, playing
  // the cue is more distracting than omitting it because the animation has
  // already completed on screen. At 20 Hz this is a 400 ms grace window.
  const NETWORK_SFX_MAX_EVENT_AGE_TICKS = 8;
  const NETWORK_SFX_MAX_DECODE_DELAY_MS = 120;
  const NETWORK_SFX_PRELOAD_IDS = Object.freeze([
    'sword_swing', 'fire', 'fire_burn', 'lazer_blast', 'aoe',
    'lightning_charge', 'dash', 'enemy_hit', 'coin', 'item_collect',
    'player_hurt',
  ]);
  // Matches the campaign gate in world.js: drop chip/DoT ticks and rate-limit
  // the rest so the hurt cue stays a signal instead of a stutter.
  const PLAYER_HURT_SFX_MIN_GAP_MS = 220;
  const PLAYER_HURT_SFX_MIN_RATIO = 0.012;
  // The authority owns the hold-to-charge table (button bit + maxChargeTicks).
  // Deriving both the held-button map and the predicted charge clock from it
  // keeps client presentation on exactly the profile the server will release
  // against, instead of a second copy that silently drifts out of parity.
  const HOLD_TO_CHARGE_MOVES = combatSystem.HOLD_TO_CHARGE_MOVES || Object.freeze({});
  const HELD_BUTTON_BY_ABILITY = Object.freeze(
    Object.fromEntries(Object.entries(HOLD_TO_CHARGE_MOVES)
      .map(([moveKey, profile]) => [moveKey, profile.button])),
  );

  // This is intentionally an adapter, not another balance table.  The client
  // only uses it for the short provisional visual before an authority snapshot
  // arrives; the campaign/authority projectile policy remains the source of
  // every charge-dependent number.
  function planChargedProjectilePreview(moveKey, player, data, chargeRatio) {
    const itemStats = player?.itemStats || {};
    const stats = MOVE_BASE_STATS[moveKey] || {};
    if (moveKey === 'death_ball') {
      if (typeof projectilePolicies.planCampaignDeathBall !== 'function') throw new Error('Shared Death Ball policy is unavailable');
      return projectilePolicies.planCampaignDeathBall({
        chargeRatio,
        baseDamage: Number(stats.damage || 40),
        damageMultiplier: itemStats.damageMultiplier,
        aoeRadiusMultiplier: itemStats.aoeRadiusMultiplier,
      });
    }
    if (moveKey === 'love_bomb_laser') {
      if (typeof projectilePolicies.planCampaignLoveBomb !== 'function') throw new Error('Shared Love Bomb policy is unavailable');
      return projectilePolicies.planCampaignLoveBomb({
        chargeRatio,
        baseDamage: Number(stats.damage || 34),
        damageMultiplier: itemStats.damageMultiplier,
        beamDamageMultiplier: itemStats.beamDamageMultiplier,
        aoeRadiusMultiplier: itemStats.aoeRadiusMultiplier,
        projectileSpeedMultiplier: itemStats.projectileSpeedMultiplier,
        originX: data.originX,
        originY: data.originY,
        targetX: data.targetX,
        targetY: data.targetY,
        range: Number(stats.range || 420),
      });
    }
    if (moveKey === 'ghost_ball') {
      if (typeof projectilePolicies.planCampaignGhostBall !== 'function') throw new Error('Shared Ghost Ball policy is unavailable');
      return projectilePolicies.planCampaignGhostBall({
        chargeRatio,
        baseDamage: Number(stats.damage || 34),
        beamDamageMultiplier: itemStats.beamDamageMultiplier,
        aoeRadiusMultiplier: itemStats.aoeRadiusMultiplier,
      });
    }
    return null;
  }

  function previewAnvilMoveBonus(player, moveKey, statKey) {
    const steps = Math.max(0, Math.trunc(Number(player?.anvilUpgrades?.move?.[moveKey]?.[statKey]) || 0));
    return steps * Number(forgePolicies.MOVE_UPGRADEABLE_STATS?.[statKey]?.step || 0);
  }

  function planAreaMovePreview(moveKey, player, state = null, aimDirection = 0) {
    if (moveKey === 'mooggy_hairball') {
      if (typeof moveEffects.resolveCampaignMooggyHairball !== 'function') throw new Error('Shared Mooggy Hairball policy is unavailable');
      return moveEffects.resolveCampaignMooggyHairball({
        aoeRadiusMultiplier: player?.itemStats?.aoeRadiusMultiplier,
        aoeDamageMultiplier: player?.itemStats?.aoeDamageMultiplier,
      });
    }
    if (moveKey === 'crimson_smash' || moveKey === 'hammer_smash') {
      if (typeof moveEffects.planCampaignGroundSmash !== 'function') throw new Error('Shared ground-smash policy is unavailable');
      return moveEffects.planCampaignGroundSmash({
        moveKey,
        godMode: Number(state?.tick || 0) < Number(player?.godUntilTick || 0),
        anvilDamage: previewAnvilMoveBonus(player, moveKey, 'damage'),
        anvilRange: previewAnvilMoveBonus(player, moveKey, 'range'),
        aoeRadiusMultiplier: player?.itemStats?.aoeRadiusMultiplier,
        level: player?.level,
        aimDirection,
      });
    }
    return null;
  }

  function previewRoomForPlayer(state, player) {
    return state?.floorState?.layout?.rooms?.find(room => room.id === player?.roomId) || null;
  }

  function previewRoomBlocked(room, x, y, radius) {
    const intersects = roomInterior.circleIntersectsRoomObstacle;
    if (typeof intersects !== 'function') return false;
    return [...(room?.structures || []), ...(room?.destructibles || [])]
      .some(obstacle => !obstacle?.broken && !obstacle?.hidden && intersects(x, y, radius, obstacle));
  }

  // The network view only predicts transform/presentation data. It nevertheless
  // resolves that data through the authored movement policies and snapshot room
  // geometry, so an accepted dash does not visibly take a path the campaign
  // runtime would reject.
  function planPredictedDashPreview(options = {}) {
    const abilityId = String(options.abilityId || '');
    const player = options.player || {};
    const state = options.state || {};
    const floor = state.floorState || options.floor || {};
    const room = previewRoomForPlayer(state, player);
    const originX = Number(options.originX ?? player.x ?? 0);
    const originY = Number(options.originY ?? player.y ?? 0);
    const radius = Math.max(1, Number(player.radius || CAMPAIGN_PLAYER_RADIUS));
    const aimDirection = Number(options.aimDirection || 0);
    const moveX = Number(options.moveX || 0);
    const moveY = Number(options.moveY || 0);
    const targetX = Number.isFinite(Number(options.targetX)) ? Number(options.targetX) : undefined;
    const targetY = Number.isFinite(Number(options.targetY)) ? Number(options.targetY) : undefined;
    const chargeRatio = clamp(Number(options.chargeRatio || 0), 0, 1);
    const width = Number(floor.width || 900);
    const height = Number(floor.height || 700);
    const wall = Number(floor.wallThickness || 28);
    const safeLanding = (point, landingOptions = {}) => {
      if (typeof movementRules.resolveCampaignBlinkDestination !== 'function') throw new Error('Shared blink landing policy is unavailable');
      return movementRules.resolveCampaignBlinkDestination({
        originX, originY, targetX: point.x, targetY: point.y, radius, width, height, wall,
        maxSearchRadius: landingOptions.maxSearchRadius,
        searchStep: landingOptions.searchStep,
        isBlocked: (x, y, clearRadius) => previewRoomBlocked(room, x, y, clearRadius),
      });
    };
    if (abilityId === 'dash') {
      if (typeof movementRules.resolveCampaignDashBurst !== 'function') throw new Error('Shared dash-burst policy is unavailable');
      const tick = Number(state.tick || 0);
      const attackSpeed = Math.max(0.2, Number(player.attackSpeed || 1))
        * Math.max(0, Number(player.itemStats?.attackSpeedMultiplier || 1))
        * Math.max(0, Number(moveEffects.getCampaignTurtlePowerUpMultiplier?.(player, tick) ?? 1));
      const dash = movementRules.resolveCampaignDashBurst({
        moveX, moveY, aimDirection, attackSpeed,
        godMode: tick < Number(player.godUntilTick || 0),
      });
      return { kind: 'glide', destinationX: originX, destinationY: originY, ...dash };
    }
    if (abilityId === 'nimrod_stomp') {
      if (typeof movementRules.resolveCampaignNimrodStomp !== 'function') throw new Error('Shared Nimrod Stomp policy is unavailable');
      const stomp = movementRules.resolveCampaignNimrodStomp({
        chargeRatio, width, height, rangeMultiplier: player.itemStats?.aoeRadiusMultiplier,
      });
      const landing = safeLanding({
        x: originX + Math.cos(aimDirection) * stomp.leapDistance,
        y: originY + Math.sin(aimDirection) * stomp.leapDistance,
      }, { maxSearchRadius: 140, searchStep: 20 });
      return landing && { kind: 'blink', destinationX: landing.x, destinationY: landing.y, effectRadius: stomp.radius, stomp };
    }
    if (abilityId === 'warp') {
      const landing = safeLanding({
        x: targetX ?? originX + Math.cos(aimDirection) * 300,
        y: targetY ?? originY + Math.sin(aimDirection) * 300,
      });
      return landing && { kind: 'blink', destinationX: landing.x, destinationY: landing.y };
    }
    const entities = Object.values(state.enemies || {}).filter(enemy => (
      enemy && !enemy.dead && Number(enemy.health ?? enemy.hp ?? 1) > 0 && enemy.roomId === player.roomId
    ));
    if (abilityId === 'zip_lightning') {
      if (typeof dashPolicies.planCampaignZipLightning !== 'function') throw new Error('Shared Zip Lightning policy is unavailable');
      const plan = dashPolicies.planCampaignZipLightning({
        entities, originX, originY,
        targetX: targetX ?? originX + Math.cos(aimDirection) * 280,
        targetY: targetY ?? originY + Math.sin(aimDirection) * 280,
        fallbackAngle: aimDirection, playerRadius: radius, level: player.level,
        resolveLanding: point => safeLanding(point, { maxSearchRadius: 90, searchStep: 14 }),
      });
      const destination = plan.hops.at(-1) || plan.fallback;
      return destination && { kind: 'blink', destinationX: destination.x, destinationY: destination.y, plan };
    }
    if (abilityId === 'knight_slash_dash') {
      if (typeof dashPolicies.planCampaignKnightSlashDash !== 'function') throw new Error('Shared Knight Slash Dash policy is unavailable');
      const plan = dashPolicies.planCampaignKnightSlashDash({
        entities, originX, originY,
        targetX: targetX ?? originX + Math.cos(aimDirection) * 300,
        targetY: targetY ?? originY + Math.sin(aimDirection) * 300,
        fallbackAngle: aimDirection, playerRadius: radius,
        resolveLanding: (point, context) => safeLanding(point, { maxSearchRadius: 90, searchStep: 14 })
          || (context?.alternate && safeLanding(context.alternate, { maxSearchRadius: 90, searchStep: 14 })),
      });
      const destination = plan.hops.at(-1) || plan.fallback;
      return destination && { kind: 'blink', destinationX: destination.x, destinationY: destination.y, plan };
    }
    return null;
  }

  function beamChannelLaserMode(moveKey) {
    return moveKey === 'turtle_wave' || moveKey === 'holy_eye_beams'
      || moveKey === 'thorn_blood_beams' || moveKey === 'god_sweep'
      ? moveKey
      : 'beam';
  }
  const CAMPAIGN_PRESENTATION_KEYS = Object.freeze([
    'player', 'projectiles', 'rooms', 'currentRoom', 'floor', 'floorsEntered',
    'enemies', 'chests', 'pickups', 'hazards', 'decorations', 'structures',
    'destructibles', 'deadBodies', 'cooldowns', 'environmentBackgroundCache',
    'laserActive', 'laserTime', 'laserTick', 'laserMode', 'laserAngle',
    'laserSweepSpeed', 'loveBeamCasting', 'activeBeamPaths', 'justiceBlades',
    'titanHammer', 'ghostBalls', 'skySwords', 'gameElapsedTime', 'lavaAnimTime',
    'showFloorTransition', 'floorTransitionTime', 'presentationPlayerSlots',
    'multiplayerMapPlayerSlots', 'activePlayerEffects', 'presentationViewpointPlayer', 'beamStruggle',
  ]);

  function deriveAbilityPresentation(data = {}) {
    const key = String(data.abilityId || '');
    const authored = ABILITY_PRESENTATIONS[key];
    if (authored) return authored;
    if (data.slot === 'dash') return { color: '#8fdcff', style: 'light' };
    if (data.mode === 'support') return { color: '#78f0bc', style: 'light' };
    if (data.slot === 'smash') return { color: '#ffb36b', style: 'heavy' };
    return { color: '#d89bff', style: 'normal' };
  }

  // Stable per-player colour from the player's slot. playerId is allocated as
  // "player-N" by the authority, so N-1 maps to a deterministic palette slot.
  function derivePlayerColor(player = {}) {
    if (typeof player.slotIndex === 'number') return PLAYER_COLORS[player.slotIndex % PLAYER_COLORS.length];
    const match = /(\d+)\s*$/.exec(String(player.id || ''));
    const index = match ? (Number(match[1]) - 1) : 0;
    return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
  }

  function deriveEnemyProjectileColor(behavior) {
    if (behavior === 'beam') return '#c77bff';
    if (behavior === 'burst') return '#ff9f68';
    return '#ffc477';
  }

  // Resolve a projectile's colour: prefer the shared content table (same data
  // the authority used to embed), fall back to a neutral player/enemy tint.
  function deriveProjectileColor(projectile = {}, neo = {}) {
    const defs = neo.PROJECTILE_TYPE_DEFS || root.NeoNyke?.content?.PROJECTILE_TYPE_DEFS || {};
    const kind = projectile.kind || projectile.type;
    if (kind === 'biscuit') return '#d99032';
    if (defs[kind]?.color) return defs[kind].color;
    if (projectile.hostile) return deriveEnemyProjectileColor(projectile.behavior);
    return '#9de9ff';
  }

  function normalizeMovement(moveX = 0, moveY = 0) {
    if (movementRules.resolveCampaignMovementInput) {
      return movementRules.resolveCampaignMovementInput(moveX, moveY);
    }
    let x = Number(moveX) || 0;
    let y = Number(moveY) || 0;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    return { moveX: x, moveY: y };
  }

  function computeWorldTransform(canvasWidth, canvasHeight, roomWidth = CAMPAIGN_ROOM_GEOMETRY.width, roomHeight = CAMPAIGN_ROOM_GEOMETRY.height, visibleBounds = null) {
    const bounds = visibleBounds || { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    const visibleWidth = Math.max(1, bounds.right - bounds.left);
    const visibleHeight = Math.max(1, bounds.bottom - bounds.top);
    const scale = Math.min(visibleWidth / roomWidth, visibleHeight / roomHeight);
    return {
      scale,
      offsetX: bounds.left + (visibleWidth - roomWidth * scale) / 2,
      offsetY: bounds.top + (visibleHeight - roomHeight * scale) / 2,
      roomWidth,
      roomHeight,
    };
  }

  function computeCameraTransform(canvasWidth, canvasHeight, camera = { x: 0, y: 0 }, visibleBounds = null) {
    const bounds = visibleBounds || { left: 0, top: 0, right: canvasWidth, bottom: canvasHeight };
    return {
      scale: 1,
      offsetX: bounds.left - Number(camera.x || 0),
      offsetY: bounds.top - Number(camera.y || 0),
      roomWidth: Math.max(1, Number(canvasWidth) || 1),
      roomHeight: Math.max(1, Number(canvasHeight) || 1),
    };
  }

  function lerpAngle(from, to, amount) {
    let delta = (Number(to) || 0) - (Number(from) || 0);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return (Number(from) || 0) + delta * amount;
  }

  function interpolatePlayers(previous = {}, current = {}, alpha = 1, options = {}) {
    const amount = clamp(Number(alpha) || 0, 0, 1);
    const extrapolationSeconds = Math.max(0, Math.min(
      MAX_REMOTE_EXTRAPOLATION_MS / 1000,
      Number(options.extrapolationSeconds) || 0,
    ));
    return Object.fromEntries(Object.entries(current).map(([playerId, player]) => {
      const before = previous[playerId] || player;
      const changedRoom = before.roomId && player.roomId && before.roomId !== player.roomId;
      // A channelled beam's authoritative angle only steps at snapshot rate;
      // lerp it between samples so remote beams sweep as smoothly as local ones.
      const beamChannel = player.beamChannel && before.beamChannel
        && player.beamChannel.startTick === before.beamChannel.startTick
        ? { ...player.beamChannel, angle: lerpAngle(before.beamChannel.angle, player.beamChannel.angle, amount) }
        : player.beamChannel;
      const baseX = changedRoom
        ? Number(player.x || 0)
        : Number(before.x || 0) + (Number(player.x || 0) - Number(before.x || 0)) * amount;
      const baseY = changedRoom
        ? Number(player.y || 0)
        : Number(before.y || 0) + (Number(player.y || 0) - Number(before.y || 0)) * amount;
      // Once interpolation reaches the newest sample, dead-reckon briefly from
      // its authority velocity instead of freezing until a sparse next update.
      // The strict cap prevents a stalled connection from running away.
      const extrapolate = !changedRoom && Number(alpha) > 1 ? extrapolationSeconds : 0;
      return [playerId, {
        ...player,
        beamChannel,
        x: baseX + Number(player.vx || 0) * extrapolate,
        y: baseY + Number(player.vy || 0) * extrapolate,
      }];
    }));
  }

  function predictPosition(player, input, fixedDelta, floorState = {}, currentTick = floorState.tick) {
    const stunned = Number(currentTick || 0) < Number(player.stunnedUntilTick || 0);
    const movement = stunned ? { moveX: 0, moveY: 0 } : normalizeMovement(input.moveX, input.moveY);
    const speed = movementRules.getCampaignPlayerMovementSpeed?.(player, currentTick)
      ?? Math.max(0, Number(player.moveSpeed) || 228);
    const radius = Math.max(1, Number(player.radius) || CAMPAIGN_PLAYER_RADIUS);
    const wall = Math.max(0, Number(floorState.wallThickness) || 28);
    const width = Math.max(1, Number(floorState.width) || 900);
    const height = Math.max(1, Number(floorState.height) || 700);
    const minimum = wall + radius;
    // A dashing hero glides at its locked dash velocity and ignores input,
    // matching the authority's movement resolution so prediction doesn't fight
    // the dash and snap the hero back mid-glide. Stun cancels that branch on
    // authority, so prediction must stop it on the same pre-step tick.
    const dashing = !stunned && movementRules.isCampaignPlayerDashing?.(player, currentTick);
    const vx = dashing
      ? Number(player.dashVx || 0)
      : (movementRules.applyResponsiveVelocity?.(player.vx, movement.moveX * speed, fixedDelta) ?? movement.moveX * speed);
    const vy = dashing
      ? Number(player.dashVy || 0)
      : (movementRules.applyResponsiveVelocity?.(player.vy, movement.moveY * speed, fixedDelta) ?? movement.moveY * speed);
    const desiredX = clamp(Number(player.x || 0) + vx * fixedDelta, minimum, width - minimum);
    const desiredY = clamp(Number(player.y || 0) + vy * fixedDelta, minimum, height - minimum);
    const room = floorState.layout?.rooms?.find(candidate => candidate.id === player.roomId);
    const collision = roomInterior.resolveRoomObstacleMovement?.(room, player, desiredX, desiredY)
      || { x: desiredX, y: desiredY, blockedX: false, blockedY: false };
    return {
      ...player,
      x: collision.x,
      y: collision.y,
      vx: collision.blockedX ? 0 : vx,
      vy: collision.blockedY ? 0 : vy,
      aimDirection: Number(input.aimDirection) || 0,
    };
  }

  class NetworkGameView {
    constructor(options = {}) {
      if (!options.session) throw new TypeError('NetworkGameView requires a multiplayer session');
      this.session = options.session;
      this.neo = options.neo || root.Neo || {};
      this.canvas = options.canvas || this.neo.canvas;
      this.ctx = options.context || this.neo.ctx;
      this.document = options.document || root.document;
      this.active = false;
      this.keys = new Set();
      this.aimDirection = 0;
      this.laserHeld = false;
      this.keyboardLaserHeld = false;
      this.gamepadLaserHeld = false;
      this.touchLaserHeld = false;
      this.keyboardSmashHeld = false;
      this.gamepadSmashHeld = false;
      this.touchSmashHeld = false;
      this.keyboardDashHeld = false;
      this.gamepadDashHeld = false;
      this.touchDashHeld = false;
      this.previousTouchActions = { slash: false, laser: false, smash: false, ascend: false, dash: false, beamMash: false };
      this.previousGamepadActions = { slash: false, laser: false, smash: false, dash: false };
      this.localBeamAngle = null;
      this.localBeamChannelStart = -1;
      this.previousSample = null;
      this.currentSample = null;
      this.localPredictedPlayer = null;
      this.localPredictedPlayerId = null;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.unsubscribe = null;
      this.inputTimer = null;
      this.animationFrame = null;
      this.lastRoomCode = '';
      this.lastTransitionSequence = 0;
      this.transitionFlashUntil = 0;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.seenGameplayEvents = new Set();
      this.combatEffects = [];
      this.pendingCombatPredictions = [];
      this.predictedProjectiles = [];
      this.pendingHeldCharge = null;
      this.pendingBeamPresentation = null;
      this.localBeamReleaseRequested = false;
      this.predictedCombatSequence = 0;
      this.actionAvailabilityByKey = new Map();
      this.presentationRooms = new Map();
      this.presentationPlayerSlots = [];
      this.presentationPlayerActors = new Map();
      this.presentationEnemyActors = new Map();
      this.enemyLostSightStartedAtTick = new Map();
      this.presentationProjectiles = new Map();
      this.presentationPickups = new Map();
      this.presentationSpecialChoiceKey = '';
      this.presentationSpecialChoiceAnchors = [];
      this.presentationHazards = new Map();
      this.presentationBodies = new Map();
      this.presentationInteractables = new Map();
      this.gamepadAttackPressed = false;
      this.gamepadMeleeHeld = false;
      this.touchMeleeHeld = false;
      this.camera = { x: 0, y: 0, roomId: null };
      this.lastPresentationFrameAt = 0;
      this.presentationElapsedSeconds = null;
      this.latestAuthorityTick = 0;
      this.sessionPlayerId = null;
      this.latestLobbyState = null;
      this.pauseState = { pauseMode: 'shared', paused: false, votes: [], requiredVotes: 1 };
      this.authorityPaused = false;
      this.lastWorldTransform = null;
      this.paused = false;
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      this.inputSuspended = false;
      this.pendingNeutralInputSequence = null;
      this.neutralInputSendAttempts = 0;
      this.lastNeutralInputSentAt = null;
      // Every locally integrated movement sample is tagged with the most
      // recent input sequence. Snapshot acknowledgement lets us rebuild the
      // local hero from authority state instead of repeatedly blending drift.
      this.pendingInputHistory = [];
      this.localPredictionTick = 0;
      this.lastLocalPredictionAt = 0;
      this.lastLocalPredictionInput = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
      this.lastMovementInputSequence = -1;
      this.localPredictionAccumulatorMs = 0;
      this.lastProcessedSnapshotSequence = -1;
      this.stateEpoch = -1;
      this.reconciliationOffset = null;
      this.diagnosticsVisible = false;
      this.diagnosticsElement = null;
      this.lastDiagnosticsRenderAt = 0;
      this.longTaskObserver = null;
      this.spectatorPlayerId = null;
      this.localWasDowned = false;
      this.spectatorRenderSignature = '';
      this.chatRenderSignature = '';
      this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
      this.requestedInteractions = new Set();
      this.campaignPresentationState = null;
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.campaignGameState = null;
      this.boundKeyDown = event => this._onKey(event, true);
      this.boundKeyUp = event => this._onKey(event, false);
      this.boundPointerMove = event => this._onPointerMove(event);
      this.boundPointerDown = event => this._onPointerDown(event);
      this.boundPointerUp = event => this._onPointerUp(event);
      this.boundChatSubmit = event => {
        event.preventDefault();
        this._submitChat();
      };
      this.boundChatClose = event => {
        event.preventDefault();
        this._closeChat();
      };
      this.boundSpectatorSelect = event => {
        const button = event.target?.closest?.('[data-spectator-player-id]');
        if (!button) return;
        this.spectatorPlayerId = button.dataset.spectatorPlayerId || null;
        this._renderSpectatorControls(this.currentSample?.state, this._sessionPlayerId(), true);
      };
      this.boundContextMenu = event => {
        if (this.active && event.target === this.canvas) event.preventDefault();
      };
      this.boundBlur = () => this._suspendInput();
      this.boundFocus = () => this._resumeInput();
      this.boundVisibilityChange = () => {
        if (this.document?.hidden === true || this.document?.visibilityState === 'hidden') {
          this._suspendInput();
        }
      };
      this.boundPauseResume = event => {
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        this.togglePause(false);
      };
      this.boundPauseSettings = event => {
        event?.preventDefault?.();
        event?.stopImmediatePropagation?.();
        this.document?.getElementById('settingsBtn')?.click();
      };
      this.pointerWasLocked = false;
      this.boundPointerLockChange = () => {
        const locked = this.document?.pointerLockElement === this.canvas;
        if (this.active && this.pointerWasLocked && !locked && !this.paused) this.togglePause(true);
        this.pointerWasLocked = locked;
      };
      this.boundRenderFrame = () => {
        if (!this.active) return;
        const frameStartedAt = root.performance?.now?.() || Date.now();
        this.syncPresentation();
        this.neo.draw?.();
        this._recordFrameDiagnostic((root.performance?.now?.() || Date.now()) - frameStartedAt);
        this.animationFrame = root.requestAnimationFrame?.(this.boundRenderFrame) ?? null;
      };
    }

    _sessionPlayerId() {
      if (this.sessionPlayerId || this.session.playerId || this.session.client?.playerId) {
        return this.sessionPlayerId || this.session.playerId || this.session.client.playerId;
      }
      // Lightweight test/embedding sessions may expose only the legacy
      // snapshot facade. BrowserMultiplayerSession has direct metadata getters,
      // so production render frames never take this cloning fallback.
      return this.session.snapshot?.().playerId || null;
    }

    _sessionStatus() {
      if (typeof this.session.status === 'string') return this.session.status;
      return this.session.snapshot?.().status || 'disconnected';
    }

    _recordFrameDiagnostic(frameMs) {
      if (!this.session.client?.diagnostics?.enabled) return;
      const diagnostics = this.session.client.diagnostics;
      diagnostics.frameSamples = Number(diagnostics.frameSamples || 0) + 1;
      diagnostics.frameTimeTotalMs = Number(diagnostics.frameTimeTotalMs || 0) + Math.max(0, Number(frameMs) || 0);
      diagnostics.maxFrameTimeMs = Math.max(Number(diagnostics.maxFrameTimeMs || 0), Math.max(0, Number(frameMs) || 0));
    }

    _recordFrameInterval(frameMs) {
      if (!this.session.client?.diagnostics?.enabled || !(frameMs > 0)) return;
      const diagnostics = this.session.client.diagnostics;
      diagnostics.frameIntervalSamples = Number(diagnostics.frameIntervalSamples || 0) + 1;
      diagnostics.frameIntervalTotalMs = Number(diagnostics.frameIntervalTotalMs || 0) + frameMs;
      diagnostics.maxFrameIntervalMs = Math.max(Number(diagnostics.maxFrameIntervalMs || 0), frameMs);
      if (frameMs >= 50) diagnostics.longFrames = Number(diagnostics.longFrames || 0) + 1;
    }

    _toggleDiagnostics(visible = !this.diagnosticsVisible) {
      this.diagnosticsVisible = visible === true;
      this.session.enableDiagnostics?.(this.diagnosticsVisible);
      if (this.diagnosticsVisible && !this.longTaskObserver && typeof root.PerformanceObserver === 'function') {
        try {
          this.longTaskObserver = new root.PerformanceObserver(list => {
            list.getEntries().forEach(entry => {
              const diagnostics = this.session.client?.diagnostics;
              if (!diagnostics?.enabled) return;
              diagnostics.longTasks = Number(diagnostics.longTasks || 0) + 1;
              diagnostics.maxLongTaskMs = Math.max(Number(diagnostics.maxLongTaskMs || 0), Number(entry.duration || 0));
              this.session.client._recordDiagnostic?.('long-task', {
                durationMs: Number(Number(entry.duration || 0).toFixed(1)),
              });
            });
          });
          this.longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch { this.longTaskObserver = null; }
      } else if (!this.diagnosticsVisible && this.longTaskObserver) {
        this.longTaskObserver.disconnect();
        this.longTaskObserver = null;
      }
      if (!this.diagnosticsElement && this.document?.body) {
        const element = this.document.createElement('section');
        element.className = 'multiplayer-diagnostics';
        element.setAttribute('aria-live', 'polite');
        element.addEventListener('click', event => {
          if (event.target?.closest?.('[data-diagnostics-export]')) this._downloadDiagnostics();
        });
        this.document.body.appendChild(element);
        this.diagnosticsElement = element;
      }
      this.diagnosticsElement?.classList.toggle('hidden', !this.diagnosticsVisible);
      this._renderDiagnostics(true);
    }

    _renderDiagnostics(force = false) {
      if (!this.diagnosticsVisible || !this.diagnosticsElement) return;
      const now = root.performance?.now?.() || Date.now();
      if (!force && now - this.lastDiagnosticsRenderAt < 250) return;
      this.lastDiagnosticsRenderAt = now;
      const metrics = this.session.client?.diagnostics || {};
      const elapsedSeconds = Math.max(1, (Date.now() - Number(metrics.startedAt || Date.now())) / 1000);
      const snapshotRate = Number(metrics.snapshots || 0) / elapsedSeconds;
      const bandwidth = Number(metrics.snapshotBytes || 0) / elapsedSeconds / 1024;
      const averageFrame = Number(metrics.frameSamples || 0)
        ? Number(metrics.frameTimeTotalMs || 0) / Number(metrics.frameSamples)
        : 0;
      const averageInterval = Number(metrics.frameIntervalSamples || 0)
        ? Number(metrics.frameIntervalTotalMs || 0) / Number(metrics.frameIntervalSamples)
        : 0;
      this.diagnosticsElement.innerHTML = `
        <div class="multiplayer-diagnostics__title">NETWORK DIAGNOSTICS <kbd>F8</kbd></div>
        <div>RTT <strong>${Number(metrics.rttMs || 0).toFixed(0)} ms</strong> · Jitter <strong>${Number(metrics.jitterMs || 0).toFixed(0)} ms</strong></div>
        <div>Snapshots <strong>${snapshotRate.toFixed(1)}/s</strong> · <strong>${bandwidth.toFixed(1)} KiB/s</strong> · max <strong>${Math.round(Number(metrics.maxSnapshotBytes || 0) / 1024)} KiB</strong></div>
        <div>Corrections <strong>${Number(metrics.corrections || 0)}</strong> · large <strong>${Number(metrics.largeCorrections || 0)}</strong> · hard <strong>${Number(metrics.hardCorrections || 0)}</strong> · max <strong>${Number(metrics.maxCorrectionPx || 0).toFixed(1)} px</strong></div>
        <div>Frame <strong>${averageInterval.toFixed(1)} ms</strong> avg · max <strong>${Number(metrics.maxFrameIntervalMs || 0).toFixed(1)} ms</strong> · long <strong>${Number(metrics.longTasks || metrics.longFrames || 0)}</strong></div>
        <div>Presentation <strong>${averageFrame.toFixed(1)} ms</strong> avg · max <strong>${Number(metrics.maxFrameTimeMs || 0).toFixed(1)} ms</strong></div>
        <div>Rebased <strong>${Number(metrics.rebasedSnapshots || 0)}</strong> · resyncs <strong>${Number(metrics.resyncRequests || 0)}</strong> · tick <strong>${Number(this.latestAuthorityTick || 0)}</strong></div>
        <button type="button" data-diagnostics-export>EXPORT JSON</button>
      `;
    }

    _downloadDiagnostics() {
      const report = this.session.exportDiagnostics?.({
        presentation: {
          renderedPlayers: Number(this.lastRenderedPlayerCount || 0),
          renderedEnemies: Number(this.lastRenderedEnemyCount || 0),
          renderedProjectiles: Number(this.lastRenderedProjectileCount || 0),
          renderedPickups: Number(this.lastRenderedPickupCount || 0),
        },
      });
      if (!report || typeof root.Blob !== 'function' || !root.URL?.createObjectURL) return report;
      const url = root.URL.createObjectURL(new root.Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = `neonyke-multiplayer-diagnostics-${report.diagnosticSessionId || 'session'}.json`;
      anchor.click();
      root.setTimeout?.(() => root.URL.revokeObjectURL(url), 0);
      return report;
    }

    start() {
      if (this.active) return;
      if (!this.canvas || !this.ctx) throw new Error('NetworkGameView requires the Neo Nyke canvas');
      this._captureCampaignPresentationState();
      this.active = true;
      // Start fetching/decoding the compact combat set while the lobby-to-run
      // transition is happening. This keeps the first remote cast from being
      // delayed by Web Audio's first-use decode.
      void this.neo.preloadSfx?.(NETWORK_SFX_PRELOAD_IDS);
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      this.inputSuspended = this.document?.hidden === true || this.document?.visibilityState === 'hidden';
      this.pendingNeutralInputSequence = null;
      this.neutralInputSendAttempts = 0;
      this.lastNeutralInputSentAt = null;
      // Use the campaign's real presentation/UI state. The main update loop
      // explicitly skips local simulation while this adapter is active, so this
      // enables canonical mouse-look, panels, pause and settings without running
      // a second authority in the browser.
      this.neo.setGameState?.('play');
      this.document?.getElementById('start')?.classList.add('hidden');
      this._setCampaignHudVisible(true);
      root.document?.body?.classList.add('network-multiplayer-active');
      root.addEventListener?.('keydown', this.boundKeyDown);
      root.addEventListener?.('keyup', this.boundKeyUp);
      root.addEventListener?.('pointermove', this.boundPointerMove);
      root.addEventListener?.('pointerdown', this.boundPointerDown);
      root.addEventListener?.('pointerup', this.boundPointerUp);
      root.addEventListener?.('contextmenu', this.boundContextMenu);
      root.addEventListener?.('blur', this.boundBlur);
      root.addEventListener?.('focus', this.boundFocus);
      this.document?.addEventListener?.('visibilitychange', this.boundVisibilityChange);
      this.pointerWasLocked = this.document?.pointerLockElement === this.canvas;
      this.document?.addEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.addEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.addEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('multiplayerChat')?.classList.remove('hidden');
      this.document?.getElementById('multiplayerChatForm')?.addEventListener('submit', this.boundChatSubmit);
      this.document?.getElementById('multiplayerChatClose')?.addEventListener('click', this.boundChatClose);
      this.document?.getElementById('multiplayerSpectatorPlayers')?.addEventListener('click', this.boundSpectatorSelect);
      this.unsubscribe = this.session.subscribe(snapshot => this._onSnapshot(snapshot));
      this.inputTimer = root.setInterval(() => this._sendInput(), INPUT_INTERVAL_MS);
      this._onSnapshot(this.session.snapshot());
      // Multiplayer replaces only the authority simulation. It still needs the
      // campaign frame loop for shared presentation updates (corpse physics,
      // particles, lava, and the normal draw path). Starting an adapter-owned
      // loop from the menu bypassed those systems entirely.
      if (!this.neo.loopStarted && typeof this.neo.loop === 'function') {
        this.neo.loopStarted = true;
        root.requestAnimationFrame?.(this.neo.loop);
      } else if (!this.neo.loopStarted) {
        // Test/minimal hosts without the campaign loop retain a small fallback.
        this.animationFrame = root.requestAnimationFrame?.(this.boundRenderFrame) ?? null;
      }
    }

    stop() {
      if (!this.active) return;
      this._flushNeutralInput();
      this.active = false;
      root.clearInterval?.(this.inputTimer);
      this.inputTimer = null;
      if (this.animationFrame !== null) root.cancelAnimationFrame?.(this.animationFrame);
      this.animationFrame = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      if (this.diagnosticsVisible) this.session.enableDiagnostics?.(false);
      this.diagnosticsVisible = false;
      this.diagnosticsElement?.classList.add('hidden');
      this.longTaskObserver?.disconnect?.();
      this.longTaskObserver = null;
      root.removeEventListener?.('keydown', this.boundKeyDown);
      root.removeEventListener?.('keyup', this.boundKeyUp);
      root.removeEventListener?.('pointermove', this.boundPointerMove);
      root.removeEventListener?.('pointerdown', this.boundPointerDown);
      root.removeEventListener?.('pointerup', this.boundPointerUp);
      root.removeEventListener?.('contextmenu', this.boundContextMenu);
      root.removeEventListener?.('blur', this.boundBlur);
      this.document?.removeEventListener?.('visibilitychange', this.boundVisibilityChange);
      root.removeEventListener?.('focus', this.boundFocus);
      this.document?.removeEventListener?.('pointerlockchange', this.boundPointerLockChange);
      this.document?.getElementById('pauseResume')?.removeEventListener('click', this.boundPauseResume, true);
      this.document?.getElementById('pauseSettings')?.removeEventListener('click', this.boundPauseSettings, true);
      this.document?.getElementById('multiplayerChatForm')?.removeEventListener('submit', this.boundChatSubmit);
      this.document?.getElementById('multiplayerChatClose')?.removeEventListener('click', this.boundChatClose);
      this.document?.getElementById('multiplayerSpectatorPlayers')?.removeEventListener('click', this.boundSpectatorSelect);
      this._closeChat();
      this.document?.getElementById('multiplayerChat')?.classList.add('hidden');
      this.document?.getElementById('multiplayerSpectator')?.classList.add('hidden');
      this.document?.getElementById('multiplayerPauseVote')?.classList.add('hidden');
      this._clearHeldInputSources();
      this.lastTransmittedInput = null;
      this.lastInputSentAt = 0;
      this.inputSuspended = false;
      this.pendingNeutralInputSequence = null;
      this.neutralInputSendAttempts = 0;
      this.lastNeutralInputSentAt = null;
      this.presentationPlayerSlots = [];
      this.presentationPlayerActors.clear();
      this._clearPresentationEntityCaches();
      this._togglePause(false);
      this.pauseState = { pauseMode: 'shared', paused: false, votes: [], requiredVotes: 1 };
      this.authorityPaused = false;
      this._renderPauseState();
      this._setCampaignHudVisible(false);
      this.document?.getElementById('start')?.classList.remove('hidden');
      root.document?.body?.classList.remove('network-multiplayer-active');
      this._restoreCampaignPresentationState();
      // State managers intentionally ignore same-state transitions. If a late
      // network frame exposed a HUD layer after the menu had already become the
      // current state, restoring "menu" would therefore not repaint the UI.
      // Teardown owns the final visibility invariant: no gameplay HUD survives
      // after a multiplayer view releases the screen.
      this._setCampaignHudVisible(false);
      // A 3D multiplayer frame must never remain behind the main menu after the
      // authority/session is gone. The next normal 3D render re-enables this
      // class and canvas without changing the player's saved view preference.
      root.document?.body?.classList.remove('render3d');
      const webglCanvas = this.document?.getElementById('c3d');
      if (webglCanvas) webglCanvas.style.display = 'none';
      this.ctx?.setTransform?.(1, 0, 0, 1, 0, 0);
      this.ctx?.clearRect?.(0, 0, this.canvas?.width || 0, this.canvas?.height || 0);
    }

    _captureCampaignPresentationState() {
      if (this.campaignPresentationState) return;
      this.campaignPresentationState = new Map(CAMPAIGN_PRESENTATION_KEYS.map(key => [key, {
        owned: Object.prototype.hasOwnProperty.call(this.neo, key),
        value: this.neo[key],
      }]));
      this.campaignHudState = new Map(CAMPAIGN_HUD_LAYER_IDS.map(id => {
        const element = this.document?.getElementById(id);
        return [id, element ? {
          className: element.className,
          ariaHidden: element.getAttribute?.('aria-hidden'),
          display: element.style.display,
        } : null];
      }));
      this.campaignBodyPaused = root.document?.body?.classList.contains('game-paused') || false;
      this.campaignGameState = this.neo.gameState || 'menu';
    }

    _restoreCampaignPresentationState() {
      if (!this.campaignPresentationState) return;
      this.campaignPresentationState.forEach((entry, key) => {
        if (entry.owned) this.neo[key] = entry.value;
        else delete this.neo[key];
      });
      this.campaignPresentationState = null;
      if (this.campaignHudState) {
        this.campaignHudState.forEach((saved, id) => {
          const element = this.document?.getElementById(id);
          if (!element || !saved) return;
          element.className = saved.className;
          if (saved.ariaHidden == null) element.removeAttribute?.('aria-hidden');
          else element.setAttribute?.('aria-hidden', saved.ariaHidden);
          element.style.display = saved.display;
        });
      }
      if (this.campaignBodyPaused != null) root.document?.body?.classList.toggle('game-paused', this.campaignBodyPaused);
      if (this.campaignGameState) this.neo.setGameState?.(this.campaignGameState);
      this.campaignHudState = null;
      this.campaignBodyPaused = null;
      this.campaignGameState = null;
      this.presentationRooms.clear();
      this.presentationPlayerActors.clear();
      this._clearPresentationEntityCaches();
      this.combatEffects = [];
      this.pendingCombatPredictions = [];
      this.predictedProjectiles = [];
      this.pendingHeldCharge = null;
      this.pendingBeamPresentation = null;
      this.localBeamReleaseRequested = false;
      this.predictedCombatSequence = 0;
      this.actionAvailabilityByKey.clear();
      this.seenGameplayEvents.clear();
      this.previousSample = null;
      this.currentSample = null;
      this.localPredictedPlayer = null;
      this.localPredictedPlayerId = null;
      this.lastLocalPredictionAt = 0;
      this.lastLocalPredictionInput = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
      this.lastMovementInputSequence = -1;
      this.localPredictionAccumulatorMs = 0;
      this.lastProcessedSnapshotSequence = -1;
      this.stateEpoch = -1;
      this.pendingInputHistory = [];
      this.localPredictionTick = 0;
      this.reconciliationOffset = null;
      this.lastFloorNumber = 0;
      this.floorTransitionStartedAt = 0;
      this.lastTransitionSequence = 0;
      this.transitionFlashUntil = 0;
      this.lastRoomCode = '';
      this.lastPresentationFrameAt = 0;
      this.presentationElapsedSeconds = null;
      this.latestAuthorityTick = 0;
      this.camera = { x: 0, y: 0, roomId: null };
      this.spectatorPlayerId = null;
      this.localWasDowned = false;
      this.spectatorRenderSignature = '';
      this.chatRenderSignature = '';
      this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
      this.requestedInteractions.clear();
    }

    _setCampaignHudVisible(visible) {
      // Network play reuses the campaign's independent HUD widgets, but never
      // the legacy #hud container (which still contains "Find the ladder.").
      // Visit every campaign layer while active so neither a stale menu style
      // nor a later campaign HUD refresh can expose an unsupported layer.
      CAMPAIGN_HUD_LAYER_IDS.forEach(id => {
        const element = this.document?.getElementById(id);
        if (!element) return;
        if (visible && NETWORK_CONDITIONAL_HUD_LAYER_IDS.includes(id)) {
          // Conditional widgets decide their own visibility in updateHud. Only
          // clear the menu's inline display:none so current content can be shown.
          element.style.display = '';
          return;
        }
        const showLayer = visible
          && Object.prototype.hasOwnProperty.call(NETWORK_HUD_DISPLAY_VALUES, id);
        element.classList.toggle('hidden', !showLayer);
        element.setAttribute('aria-hidden', showLayer ? 'false' : 'true');
        element.style.display = showLayer ? NETWORK_HUD_DISPLAY_VALUES[id] : 'none';
      });
    }

    _isChatOpen() {
      const form = this.document?.getElementById('multiplayerChatForm');
      return !!form && !form.classList.contains('hidden');
    }

    _openChat() {
      if (!this.active) return;
      const form = this.document?.getElementById('multiplayerChatForm');
      const input = this.document?.getElementById('multiplayerChatInput');
      if (!form || !input) return;
      this._flushNeutralInput();
      form.classList.remove('hidden');
      // Releasing pointer lock normally opens the multiplayer pause menu. Chat
      // is its own intentional focus transition, so disarm that edge first.
      if (this.document?.pointerLockElement === this.canvas) {
        this.pointerWasLocked = false;
        this.document.exitPointerLock?.();
      }
      input.focus({ preventScroll: true });
    }

    _closeChat() {
      const form = this.document?.getElementById('multiplayerChatForm');
      const input = this.document?.getElementById('multiplayerChatInput');
      form?.classList.add('hidden');
      input?.blur?.();
    }

    closeChat() {
      this._closeChat();
    }

    _submitChat() {
      const input = this.document?.getElementById('multiplayerChatInput');
      const text = String(input?.value || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        this._closeChat();
        return;
      }
      try {
        this.session.sendChat?.(text);
        input.value = '';
        this._closeChat();
      } catch {
        // Disconnect/rejection state is already surfaced by the session UI.
      }
    }

    _renderChat(messages = []) {
      const log = this.document?.getElementById('multiplayerChatLog');
      if (!log) return;
      const visible = messages.slice(-8);
      const signature = visible.map(message => message.messageId).join('|');
      if (signature === this.chatRenderSignature) return;
      this.chatRenderSignature = signature;
      const players = this.currentSample?.state?.players || {};
      log.replaceChildren(...visible.map(message => {
        const row = this.document.createElement('div');
        row.className = 'multiplayer-chat__message';
        row.style.setProperty('--chat-color', derivePlayerColor(players[message.playerId] || { id: message.playerId }));
        const name = this.document.createElement('span');
        name.className = 'multiplayer-chat__name';
        name.textContent = `${message.displayName || 'Player'}: `;
        const text = this.document.createElement('span');
        text.textContent = String(message.text || '');
        row.append(name, text);
        return row;
      }));
      log.scrollTop = log.scrollHeight;
    }

    _spectatorCandidates(state = this.currentSample?.state) {
      return Object.values(state?.players || {})
        .filter(player => player && !player.disconnected)
        .sort((first, second) => Number(first.slotIndex || 0) - Number(second.slotIndex || 0));
    }

    _renderSpectatorControls(state, localPlayerId, force = false) {
      const panel = this.document?.getElementById('multiplayerSpectator');
      if (!panel) return;
      const localPlayer = state?.players?.[localPlayerId];
      if (!localPlayer?.downed) {
        panel.classList.add('hidden');
        this.spectatorRenderSignature = '';
        return;
      }
      const candidates = this._spectatorCandidates(state);
      const target = candidates.find(player => player.id === this.spectatorPlayerId) || localPlayer;
      const signature = JSON.stringify(candidates.map(player => [player.id, player.displayName, !!player.downed, player.roomId, player.id === target.id]));
      panel.classList.remove('hidden');
      if (!force && signature === this.spectatorRenderSignature) return;
      this.spectatorRenderSignature = signature;
      const targetName = target.id === localPlayerId ? 'your downed hero' : (target.displayName || target.id);
      const targetLabel = this.document?.getElementById('multiplayerSpectatorTarget');
      if (targetLabel) targetLabel.textContent = `Viewing ${targetName}${target.downed ? ' (downed)' : ''}`;
      const controls = this.document?.getElementById('multiplayerSpectatorPlayers');
      controls?.replaceChildren(...candidates.map(player => {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = `multiplayer-spectator__player${player.id === target.id ? ' is-active' : ''}${player.downed ? ' is-downed' : ''}`;
        button.dataset.spectatorPlayerId = player.id;
        button.style.setProperty('--spectator-color', derivePlayerColor(player));
        button.textContent = `${player.displayName || player.id}${player.id === localPlayerId ? ' (YOU)' : ''}${player.downed ? ' — DOWN' : ''}`;
        return button;
      }));
    }

    _syncSpectatorState(state, localPlayerId) {
      const localPlayer = state?.players?.[localPlayerId];
      const isDowned = !!localPlayer?.downed;
      if (isDowned) {
        const candidates = this._spectatorCandidates(state);
        const targetExists = candidates.some(player => player.id === this.spectatorPlayerId);
        if (!this.localWasDowned || !targetExists) {
          this.spectatorPlayerId = candidates.find(player => player.id !== localPlayerId && !player.downed)?.id
            || localPlayerId;
        }
      } else {
        this.spectatorPlayerId = null;
      }
      this.localWasDowned = isDowned;
      this._renderSpectatorControls(state, localPlayerId);
    }

    _cycleSpectatorTarget() {
      const candidates = this._spectatorCandidates();
      if (!candidates.length) return;
      const currentIndex = candidates.findIndex(player => player.id === this.spectatorPlayerId);
      this.spectatorPlayerId = candidates[(currentIndex + 1 + candidates.length) % candidates.length].id;
      this._renderSpectatorControls(this.currentSample?.state, this._sessionPlayerId(), true);
    }

    _viewpointPlayerId(state, localPlayerId) {
      if (!state?.players?.[localPlayerId]?.downed) return localPlayerId;
      return state.players?.[this.spectatorPlayerId] ? this.spectatorPlayerId : localPlayerId;
    }

    _resetWorldEpoch(epoch) {
      this.stateEpoch = epoch;
      this.previousSample = null;
      this.currentSample = null;
      this.localPredictedPlayer = null;
      this.localPredictedPlayerId = null;
      this.pendingInputHistory = [];
      this.localPredictionTick = 0;
      this.lastLocalPredictionAt = 0;
      this.localPredictionAccumulatorMs = 0;
      this.lastLocalPredictionInput = { moveX: 0, moveY: 0, aimDirection: 0, buttons: 0 };
      this.lastMovementInputSequence = -1;
      this.lastProcessedSnapshotSequence = -1;
      this.presentationElapsedSeconds = null;
      this.reconciliationOffset = null;
      this.lastFloorNumber = 0;
      this.lastTransitionSequence = 0;
      this.seenGameplayEvents.clear();
    }

    _localPredictionPreview() {
      if (!this.localPredictedPlayer) return null;
      if (this.localPredictionAccumulatorMs <= 0) return { ...this.localPredictedPlayer };
      return predictPosition(
        this.localPredictedPlayer,
        this.lastLocalPredictionInput,
        this.localPredictionAccumulatorMs / 1000,
        this.currentSample?.state?.floorState,
        this.localPredictionTick,
      );
    }

    _onSnapshot(snapshot = {}) {
      this.lastRoomCode = snapshot.roomCode || this.lastRoomCode;
      this.sessionPlayerId = snapshot.playerId || this.sessionPlayerId;
      this.latestLobbyState = snapshot.lobbyState || this.latestLobbyState;
      this._syncPauseState(snapshot.pauseState, snapshot.lobbyState);
      const acknowledgedInput = Number(snapshot.lastAcknowledgedInput);
      if (Number.isInteger(acknowledgedInput) && acknowledgedInput >= -1) {
        this.lastAcknowledgedInput = Math.max(Number(this.lastAcknowledgedInput ?? -1), acknowledgedInput);
        if (this.pendingNeutralInputSequence != null
          && acknowledgedInput >= this.pendingNeutralInputSequence) {
          this.pendingNeutralInputSequence = null;
          this.neutralInputSendAttempts = 0;
          this.lastNeutralInputSentAt = null;
        }
      }
      this._renderChat(snapshot.chatMessages || []);
      const state = snapshot.gameState;
      const incomingEpoch = Number(snapshot.stateEpoch);
      if (Number.isInteger(incomingEpoch) && incomingEpoch >= 0 && incomingEpoch !== this.stateEpoch) {
        this._resetWorldEpoch(incomingEpoch);
      }
      this.latestAuthorityTick = Math.max(0, Number(state?.tick) || this.latestAuthorityTick || 0);
      this._consumeGameplayEvents(snapshot.gameplayEvents || [], state?.tick);
      if (!state || !state.players) return;
      this._syncSpectatorState(state, snapshot.playerId);
      const incomingSequence = Number(snapshot.snapshotSequence);
      const hasSnapshotSequence = Number.isInteger(incomingSequence) && incomingSequence >= 0;
      const sequenceOmitted = snapshot.snapshotSequence == null;
      const firstWorldState = !this.currentSample;
      const newerWorldState = firstWorldState
        || (hasSnapshotSequence && incomingSequence > this.lastProcessedSnapshotSequence)
        || (sequenceOmitted && Number(state.tick || 0) > Number(this.currentSample?.tick || -1));
      // BrowserMultiplayerSession also notifies for gameplay, chat, lobby, and
      // connection messages. Consume those above, but never reconcile an old
      // transform merely because metadata changed.
      if (!newerWorldState) return;
      if (hasSnapshotSequence) this.lastProcessedSnapshotSequence = incomingSequence;
      const receivedAt = root.performance?.now?.() || Date.now();
      const receivedFloorNumber = Math.max(1, Number(state.floorNumber || state.floorState?.layout?.floorNumber || 1));
      if (this.lastFloorNumber > 0 && receivedFloorNumber !== this.lastFloorNumber) {
        this.floorTransitionStartedAt = receivedAt;
      }
      this.lastFloorNumber = receivedFloorNumber;
      const localTransition = state.floorState?.transitionsByPlayer?.[snapshot.playerId];
      const transitionSequence = Math.max(0, Number(localTransition?.sequence) || 0);
      const transitionChanged = transitionSequence > this.lastTransitionSequence;
      if (transitionChanged) {
        if (this.lastTransitionSequence > 0 || this.currentSample) this.transitionFlashUntil = receivedAt + 260;
        this.lastTransitionSequence = transitionSequence;
      }
      this.previousSample = this.currentSample || { tick: state.tick, receivedAt, state };
      this.currentSample = { tick: state.tick, receivedAt, state };
      const authorityPlayer = state.players[snapshot.playerId];
      if (!authorityPlayer) return;
      if (authorityPlayer.beamChannel?.moveKey === this.pendingBeamPresentation?.moveKey) {
        this.pendingBeamPresentation = null;
      }
      if (transitionChanged || receivedFloorNumber !== Number(this.localPredictedPlayer?.floorNumber || receivedFloorNumber)) {
        this.localPredictedPlayerId = snapshot.playerId;
        this.localPredictedPlayer = { ...authorityPlayer, floorNumber: receivedFloorNumber };
        this.pendingInputHistory = [];
        this.localPredictionTick = Number(state.tick || 0);
        this.lastLocalPredictionAt = receivedAt;
        this.localPredictionAccumulatorMs = 0;
        this.reconciliationOffset = null;
        return;
      }
      // A reconnect (or a session handoff) can change playerId while this
      // view remains mounted. Never carry prediction from the previous
      // identity into the new authoritative entity.
      if (this.localPredictedPlayerId !== snapshot.playerId) {
        this.localPredictedPlayerId = snapshot.playerId;
        this.localPredictedPlayer = { ...authorityPlayer };
        this.pendingInputHistory = [];
        this.localPredictionTick = Number(state.tick || 0);
        this.lastLocalPredictionAt = receivedAt;
        this.localPredictionAccumulatorMs = 0;
        this.reconciliationOffset = null;
        return;
      }
      if (!this.localPredictedPlayer) {
        this.localPredictedPlayer = { ...authorityPlayer };
        this.localPredictionTick = Number(state.tick || 0);
        this.lastLocalPredictionAt = receivedAt;
        this.localPredictionAccumulatorMs = 0;
        return;
      }
      const acknowledgedInputForPrediction = Number(snapshot.lastAcknowledgedInput ?? -1);
      // A snapshot can arrive between presentation frames. Commit every complete
      // fixed prediction slice before comparing the currently displayed point.
      this._advanceLocalPrediction(receivedAt);
      const previousPredicted = this._localPredictionPreview();
      let previousPresentedX = Number(previousPredicted?.x || 0);
      let previousPresentedY = Number(previousPredicted?.y || 0);
      if (this.reconciliationOffset) {
        const elapsed = Math.max(0, receivedAt - this.reconciliationOffset.startedAt);
        const remaining = clamp(1 - elapsed / this.reconciliationOffset.durationMs, 0, 1);
        previousPresentedX += this.reconciliationOffset.x * remaining;
        previousPresentedY += this.reconciliationOffset.y * remaining;
      }
      this.pendingInputHistory = this.pendingInputHistory
        .filter(entry => entry.predictionTick > Number(state.tick || 0))
        .slice(-64);
      const reconciled = this.pendingInputHistory.reduce((predicted, entry) => predictPosition(
        predicted,
        entry.input,
        INPUT_INTERVAL_MS / 1000,
        state.floorState,
        Math.max(0, Number(entry.predictionTick || 1) - 1),
      ), { ...authorityPlayer });
      const correctionDistance = previousPredicted
        ? Math.hypot(previousPresentedX - Number(reconciled.x || 0),
          previousPresentedY - Number(reconciled.y || 0))
        : 0;
      if (correctionDistance > 0.01) {
        const diagnostics = this.session.client?.diagnostics;
        if (diagnostics?.enabled) {
          diagnostics.corrections = Number(diagnostics.corrections || 0) + 1;
          diagnostics.maxCorrectionPx = Math.max(Number(diagnostics.maxCorrectionPx || 0), correctionDistance);
          if (correctionDistance >= 32) diagnostics.largeCorrections = Number(diagnostics.largeCorrections || 0) + 1;
          if (correctionDistance >= MAX_SMOOTH_RECONCILIATION_PX) {
            diagnostics.hardCorrections = Number(diagnostics.hardCorrections || 0) + 1;
          }
          this.session.client._recordDiagnostic?.('correction', {
            distancePx: Number(correctionDistance.toFixed(2)),
            acknowledgedInput: acknowledgedInputForPrediction,
          });
        }
        if (correctionDistance < MAX_SMOOTH_RECONCILIATION_PX) {
          const snapshotIntervalMs = Math.max(
            INPUT_INTERVAL_MS,
            Number(this.currentSample?.receivedAt || receivedAt)
              - Number(this.previousSample?.receivedAt || receivedAt),
          );
          this.reconciliationOffset = {
            x: previousPresentedX - Number(reconciled.x || 0),
            y: previousPresentedY - Number(reconciled.y || 0),
            startedAt: receivedAt,
            durationMs: clamp(
              Math.min(correctionDistance * 3, snapshotIntervalMs * 0.9),
              INPUT_INTERVAL_MS,
              320,
            ),
          };
        } else {
          this.reconciliationOffset = null;
        }
      } else {
        this.reconciliationOffset = null;
      }
      this.localPredictedPlayer = reconciled;
      this.localPredictionTick = Math.max(
        Number(state.tick || 0),
        ...this.pendingInputHistory.map(entry => Number(entry.predictionTick || 0)),
      );
      this.lastLocalPredictionAt = receivedAt;
      this.lastAcknowledgedInput = Math.max(
        Number(this.lastAcknowledgedInput ?? -1),
        acknowledgedInputForPrediction,
      );
    }

    _onKey(event, pressed) {
      if (this.active && pressed && !event.repeat && event.code === 'F8') {
        event.preventDefault();
        this._toggleDiagnostics();
        return;
      }
      if (this.active && pressed && !event.repeat && event.code === 'KeyT'
        && !event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        this._openChat();
        return;
      }
      if (this._isChatOpen()) {
        if (pressed && event.code === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          this._closeChat();
        }
        return;
      }
      // Escape is owned by the campaign panel handler. Registering a second
      // network toggle here would process the same window keydown twice; that
      // handler calls togglePause() on this view exactly once.
      if (event.code === 'Escape') return;
      if (!this.active) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = eventKey(event);
      const bindings = configuredKeyboardBindings();
      const movementAction = ['up', 'down', 'left', 'right'].find(action => key === String(bindings[action]).toLowerCase());
      const arrowAction = event.code === 'ArrowUp' ? 'up'
        : event.code === 'ArrowDown' ? 'down'
          : event.code === 'ArrowLeft' ? 'left'
            : event.code === 'ArrowRight' ? 'right'
              : '';
      const resolvedMovementAction = movementAction || arrowAction;
      if (resolvedMovementAction) {
        event.preventDefault();
        const token = `action:${resolvedMovementAction}`;
        if (pressed) this.keys.add(token); else this.keys.delete(token);
        root.NeoSettings?.noteInputMode?.('keyboard');
        return;
      }
      if (key === String(bindings.laser).toLowerCase() && !['lmb', 'rmb'].includes(key)) {
        event.preventDefault();
        this.keyboardLaserHeld = pressed;
        if (pressed && !event.repeat) this._useSlot('laser');
        root.NeoSettings?.noteInputMode?.('keyboard');
        return;
      }
      if (key === String(bindings.smash).toLowerCase() && !['lmb', 'rmb'].includes(key)) {
        event.preventDefault();
        this.keyboardSmashHeld = pressed;
        if (pressed && !event.repeat) this._useSlot('smash');
        root.NeoSettings?.noteInputMode?.('keyboard');
        return;
      }
      if (key === String(bindings.dash).toLowerCase() && !['lmb', 'rmb'].includes(key)) {
        event.preventDefault();
        this.keyboardDashHeld = pressed;
        if (pressed && !event.repeat) this._useSlot('dash');
        root.NeoSettings?.noteInputMode?.('keyboard');
        return;
      }
      if (!pressed || event.repeat) return;
      const actions = Object.entries(bindings).filter(([name, value]) => (
        !['up', 'down', 'left', 'right', 'laser'].includes(name)
        && key === String(value).toLowerCase()
      )).map(([name]) => name);
      if (!actions.length) return;
      event.preventDefault();
      root.NeoSettings?.noteInputMode?.('keyboard');
      let interacted = false;
      if (actions.includes('interact')) interacted = this._interact();
      if (actions.includes('ascend') && !interacted) interacted = this._interact();
      if (actions.includes('ascend') && interacted) return;
      if (actions.includes('slash')) this._attack();
      if (actions.includes('smash')) this._useSlot('smash');
      if (actions.includes('dash')) this._useSlot('dash');
      if (actions.includes('activateAll')) this.activateAllEquipment();
      actions.filter(action => /^tool[1-8]$/.test(action))
        .forEach(action => this.activateEquipmentSlot(Number(action.slice(4)) - 1));
    }

    _onPointerDown(event) {
      const localPlayer = this.currentSample?.state?.players?.[this._sessionPlayerId()];
      if (this.active && localPlayer?.downed && event.button === 0 && event.target === this.canvas) {
        event.preventDefault();
        this._cycleSpectatorTarget();
        return;
      }
      if (!this.active || this._isInputBlocked() || ![0, 2].includes(event.button) || event.target !== this.canvas) return;
      event.preventDefault();
      this._onPointerMove(event);
      root.NeoSettings?.noteInputMode?.('keyboard');
      const binding = event.button === 2 ? 'rmb' : 'lmb';
      const bindings = configuredKeyboardBindings();
      if (String(bindings.laser).toLowerCase() === binding) {
        // Channelled beams are hold-to-maintain: the held bit rides the input
        // stream so the authority can end the channel the moment RMB lifts.
        this.laserHeld = true;
        this._useSlot('laser');
      } else if (String(bindings.slash).toLowerCase() === binding) this._attack();
    }

    _onPointerUp(event) {
      const binding = event.button === 2 ? 'rmb' : event.button === 0 ? 'lmb' : '';
      if (binding && String(configuredKeyboardBindings().laser).toLowerCase() === binding) this.laserHeld = false;
    }

    activateEquipmentSlot(index) {
      if (!this.active || this._isInputBlocked() || this._sessionStatus() !== 'running') return false;
      const player = this.currentSample?.state?.players?.[this._sessionPlayerId()];
      const itemKey = player?.equipmentSlots?.[Number(index)];
      if (!itemKey) return false;
      this.session.sendGameCommand?.('ACTIVATE_EQUIPMENT', { itemKey });
      return true;
    }

    activateAllEquipment() {
      if (!this.active || this._isInputBlocked() || this._sessionStatus() !== 'running') return false;
      const player = this.currentSample?.state?.players?.[this._sessionPlayerId()];
      let activated = false;
      (player?.equipmentSlots || []).forEach((itemKey, index) => {
        if (!itemKey) return;
        activated = this.activateEquipmentSlot(index) || activated;
      });
      return activated;
    }

    _estimatedAuthorityTick(now = root.performance?.now?.() || Date.now()) {
      const stateTick = Math.max(0, Number(this.currentSample?.state?.tick || this.currentSample?.tick || 0));
      const receivedAt = Number(this.currentSample?.receivedAt || now);
      return stateTick + Math.max(0, Number(now) - receivedAt) / INPUT_INTERVAL_MS;
    }

    _actionReservationAllows(key) {
      const reservation = this.actionAvailabilityByKey.get(key);
      if (!reservation) return true;
      const snapshotTick = Number(this.currentSample?.state?.tick || this.currentSample?.tick || 0);
      const reservationTick = Number(reservation.authorityTick);
      if (Number.isFinite(reservationTick) && reservationTick > 0 && snapshotTick >= reservationTick) {
        this.actionAvailabilityByKey.delete(key);
        return true;
      }
      if (Number(reservation.charges || 0) > 0) return true;
      const readyAtTick = Math.min(
        reservation.readyAtTick != null && Number.isFinite(Number(reservation.readyAtTick))
          ? Number(reservation.readyAtTick)
          : Infinity,
        ...(reservation.timers || []).map(Number).filter(Number.isFinite),
      );
      if (this._estimatedAuthorityTick() < readyAtTick) return false;
      this.actionAvailabilityByKey.delete(key);
      return true;
    }

    _localAttackReady() {
      const player = this.currentSample?.state?.players?.[this._sessionPlayerId()] || this.localPredictedPlayer;
      if (!player || player.downed) return false;
      const weaponKey = player.equippedWeapon;
      const meleeMove = player.equippedMoves?.melee;
      const key = `attack:${weaponKey || meleeMove || 'melee'}`;
      if (weaponKey && combatSystem.readWeaponChargeState) {
        const pool = combatSystem.readWeaponChargeState(player, weaponKey);
        if (pool.maxCharges > 1 && pool.charges <= 0
          && this._estimatedAuthorityTick() < Math.min(...pool.timers.map(Number).filter(Number.isFinite), Infinity)) return false;
      } else if (!weaponKey && meleeMove === 'mooggy_swipe' && combatSystem.readMoveChargeState) {
        const pool = combatSystem.readMoveChargeState(player, meleeMove);
        if (pool.charges <= 0
          && this._estimatedAuthorityTick() < Math.min(...pool.timers.map(Number).filter(Number.isFinite), Infinity)) return false;
      } else if (this._estimatedAuthorityTick() < Number(player.attackCooldownUntilTick || 0)) {
        return false;
      }
      return this._actionReservationAllows(key);
    }

    _localAbilityReady(moveKey) {
      const player = this.currentSample?.state?.players?.[this._sessionPlayerId()] || this.localPredictedPlayer;
      if (!player || player.downed) return false;
      if (combatSystem.readMoveChargeState) {
        const pool = combatSystem.readMoveChargeState(player, moveKey);
        if (pool.charges <= 0
          && this._estimatedAuthorityTick() < Math.min(...pool.timers.map(Number).filter(Number.isFinite), Infinity)) return false;
      } else if (this._estimatedAuthorityTick() < Number(player.moveCooldownUntilTick?.[moveKey] || 0)) {
        return false;
      }
      return this._actionReservationAllows(`move:${moveKey}`);
    }

    _recordActionAvailability(event) {
      const data = event?.data || {};
      if (data.playerId !== this._sessionPlayerId()) return;
      let key = '';
      let pool = null;
      let readyAtTick = null;
      if (event.eventType === 'PLAYER_ATTACKED' || (event.eventType === 'ACTION_REJECTED' && data.action === 'ATTACK')) {
        const weaponKey = data.weaponKey || data.attackKind || this.localPredictedPlayer?.equippedWeapon;
        const meleeMove = !weaponKey ? this.localPredictedPlayer?.equippedMoves?.melee : '';
        key = `attack:${weaponKey || meleeMove || 'melee'}`;
        pool = data.weaponChargeState || data.moveChargeState || null;
        readyAtTick = data.attackCooldownUntilTick;
      } else if (event.eventType === 'PLAYER_ABILITY_USED'
        || (event.eventType === 'ACTION_REJECTED' && (data.action === 'ABILITY' || data.action === 'DASH'))) {
        const moveKey = data.abilityId;
        if (!moveKey) return;
        key = `move:${moveKey}`;
        pool = data.moveChargeState || null;
      }
      if (!key) return;
      this.actionAvailabilityByKey.set(key, {
        authorityTick: Number(data.tick || event.authorityTick || this.latestAuthorityTick || 0),
        charges: pool ? Number(pool.charges || 0) : 0,
        timers: Array.isArray(pool?.timers) ? pool.timers.slice() : [],
        readyAtTick,
      });
    }

    _attack() {
      if (!this.active || this._isInputBlocked() || this._sessionStatus() !== 'running') return;
      if (this._hasPendingCombatPrediction('PLAYER_ATTACKED')) return;
      if (!this._localAttackReady()) return;
      try {
        const player = this.localPredictedPlayer;
        // Mooggy Swipe is campaign's bare-hands primary attack. It starts on
        // press but has no strike until release, so predicting an ordinary M1
        // here produced a false, instant melee swing online.
        if (!player?.equippedWeapon && player?.equippedMoves?.melee === 'mooggy_swipe') {
          if (this.pendingHeldCharge?.abilityId === 'mooggy_swipe') return;
          const predictionId = `predicted:${++this.predictedCombatSequence}`;
          this._startPredictedHeldCharge('mooggy_swipe', 'melee', BUTTON_MELEE_HELD, predictionId);
          this._sendInput({ additionalButton: BUTTON_MELEE_HELD, syncHeldSources: false });
          const options = { predictionId, originServerTick: this.currentSample?.tick };
          if (this.session.combatPredictionCorrelation) this.session.sendAction('ATTACK', this.aimDirection, options);
          else this.session.sendAction('ATTACK', this.aimDirection);
          return;
        }
        const prediction = this._predictLocalAttack();
        const options = {
          predictionId: prediction?.event?.eventId,
          originServerTick: this.currentSample?.tick,
        };
        if (this.session.combatPredictionCorrelation) this.session.sendAction('ATTACK', this.aimDirection, options);
        else this.session.sendAction('ATTACK', this.aimDirection);
      } catch {
        // Session state changes are surfaced by its normal disconnect handler.
      }
    }

    _useSlot(slot) {
      if (!this.active || this._isInputBlocked() || this._sessionStatus() !== 'running') return;
      if (slot === 'laser' && this.neo.beamStruggle?.active) {
        this.session.sendAction('BEAM_MASH', this.aimDirection);
        return;
      }
      const player = this.localPredictedPlayer;
      const abilityId = player?.equippedMoves?.[slot];
      if (!abilityId) return;

      if (this._hasPendingCombatPrediction('PLAYER_ABILITY_USED', abilityId)
        || this.pendingHeldCharge?.abilityId === abilityId) return;
      if (!this._localAbilityReady(abilityId)) return;
      const cursorTarget = Number.isFinite(Number(this.neo.mouse?.worldX))
        && Number.isFinite(Number(this.neo.mouse?.worldY))
        ? { targetX: Number(this.neo.mouse.worldX), targetY: Number(this.neo.mouse.worldY) }
        : {};
      try {
        const heldButton = HELD_BUTTON_BY_ABILITY[abilityId];
        if (heldButton) {
          this._startPredictedHeldCharge(abilityId, slot, heldButton);
          // The input stream is replaceable while the cast action is reliable.
          // Put an explicit held sample on the socket first, in the same send
          // order as the action, so the authority cannot start a charge from an
          // old button-up snapshot and immediately release a tiny version.
          this._sendInput({ additionalButton: heldButton, syncHeldSources: false });
        } else {
          const dashInput = slot === 'dash' ? this._readMovement() : null;
          const dashOptions = dashInput
            ? { dashMoveX: dashInput.moveX, dashMoveY: dashInput.moveY }
            : {};
          if (['warp', 'zip_lightning', 'knight_slash_dash'].includes(abilityId) && Number.isFinite(Number(this.neo.mouse?.worldX)) && Number.isFinite(Number(this.neo.mouse?.worldY))) {
            dashOptions.targetX = Number(this.neo.mouse.worldX);
            dashOptions.targetY = Number(this.neo.mouse.worldY);
          }
          const prediction = this._predictLocalAbility(abilityId, slot, dashOptions);
          const actionOptions = {
            predictionId: prediction?.event?.eventId,
            originServerTick: this.currentSample?.tick,
            ...dashOptions,
          };
          if (slot === 'dash') {
            if (this.session.combatPredictionCorrelation) this.session.sendDash(abilityId, this.aimDirection, actionOptions);
            else this.session.sendDash(abilityId, this.aimDirection);
          } else if (this.session.combatPredictionCorrelation) this.session.sendAbility(abilityId, this.aimDirection, actionOptions);
          else this.session.sendAbility(abilityId, this.aimDirection);
          return;
        }
        if (slot === 'dash') {
          const dashInput = this._readMovement();
          const dashOptions = { dashMoveX: dashInput.moveX, dashMoveY: dashInput.moveY };
          if (['warp', 'zip_lightning', 'knight_slash_dash'].includes(abilityId) && Number.isFinite(Number(this.neo.mouse?.worldX)) && Number.isFinite(Number(this.neo.mouse?.worldY))) {
            dashOptions.targetX = Number(this.neo.mouse.worldX);
            dashOptions.targetY = Number(this.neo.mouse.worldY);
          }
          if (this.session.combatPredictionCorrelation) this.session.sendDash(abilityId, this.aimDirection, { originServerTick: this.currentSample?.tick, ...dashOptions });
          else this.session.sendDash(abilityId, this.aimDirection, dashOptions);
        } else if (this.session.combatPredictionCorrelation) this.session.sendAbility(abilityId, this.aimDirection, { originServerTick: this.currentSample?.tick, ...cursorTarget });
        else if (Object.keys(cursorTarget).length) this.session.sendAbility(abilityId, this.aimDirection, cursorTarget);
        else this.session.sendAbility(abilityId, this.aimDirection);
      } catch {
        return;
      }
    }

    _interact() {
      if (!this.active || this._isInputBlocked()) return false;
      const state = this.currentSample?.state;
      const player = state?.players?.[this._sessionPlayerId()];
      if (!player || player.downed || player.pendingUpgrade) return false;
      // Shop / anvil / special-room panels are toggled by the campaign's global
      // window keydown handler in panels.js, which already runs
      // in multiplayer because the co-op game state sits in `play`. Toggling them
      // here as well made the same E press fire twice — open then instantly close,
      // the shop panel "flickering off right away". This is the same double-listener
      // trap the Escape handler in _onKey documents; keep this path to the one job
      // the campaign handler can't do without a session: sending the INTERACT
      // command for nearby server-owned chests / interactables. Network stairs
      // remain authority-owned and normally advance through their dwell timer.
      const target = Object.values(state.interactables || {})
        .filter(item => !item.opened && item.roomId === player.roomId)
        .map(item => ({ item, distance: Math.hypot(Number(item.x) - Number(player.x), Number(item.y) - Number(player.y)) }))
        .filter(entry => entry.distance <= Number(entry.item.radius || 30) + Number(player.radius || CAMPAIGN_PLAYER_RADIUS) + 38)
        .sort((first, second) => first.distance - second.distance)[0]?.item;
      if (!target) return false;
      this.session.sendInteract(target.id);
      return true;
    }

    interact() {
      return this._interact();
    }

    _syncAutomaticChestInteraction(localPlayer, state) {
      const interactables = Object.values(state?.interactables || {});
      const liveIds = new Set(interactables.map(item => item.id));
      this.requestedInteractions.forEach(id => {
        const item = state?.interactables?.[id];
        if (!liveIds.has(id) || item?.activated || item?.opened) this.requestedInteractions.delete(id);
      });
      if (!localPlayer || localPlayer.downed || localPlayer.pendingUpgrade) return;
      const chest = interactables.find(item => item.kind === 'relic_chest'
        && !item.activated && !item.opened
        && item.roomId === localPlayer.roomId
        && Math.hypot(Number(item.x) - Number(localPlayer.x), Number(item.y) - Number(localPlayer.y)) < 36);
      if (!chest || this.requestedInteractions.has(chest.id)) return;
      this.requestedInteractions.add(chest.id);
      try {
        this.session.sendInteract(chest.id);
      } catch {
        this.requestedInteractions.delete(chest.id);
      }
    }

    _selectUpgrade(index) {
      const player = this.currentSample?.state?.players?.[this._sessionPlayerId()];
      const pending = player?.pendingUpgrade;
      const optionId = pending?.optionIds?.[index];
      if (!optionId) return false;
      this.session.sendUpgrade(pending.selectionEventId, optionId);
      return true;
    }

    _upgradePresentationPickups(state = this.currentSample?.state) {
      const playerId = this._sessionPlayerId();
      const pending = state?.players?.[playerId]?.pendingUpgrade;
      if (!pending?.options?.length) return [];
      const source = state.interactables?.[pending.sourceEntityId]
        || (pending.kind === 'boss_rush_starter'
          ? { roomId: state?.players?.[playerId]?.roomId, x: pending.sourceX, y: pending.sourceY }
          : null);
      if (!source) return [];
      const count = pending.options.length;
      return pending.options.map((option, index) => ({
        id: `network-choice:${pending.selectionEventId}:${option.id}`,
        type: 'rewardChoice',
        key: option.id,
        label: option.name || option.id,
        itemPresentation: option,
        groupId: pending.selectionEventId,
        optionId: option.id,
        selectionEventId: pending.selectionEventId,
        roomId: source.roomId,
        x: pending.kind === 'boss_rush_starter'
          ? Number(source.x || 0) + ((Number(option.slotIndex ?? index) % 5) - 2) * 140
          : Number(source.x || 0) + (index - (count - 1) / 2) * 144,
        y: pending.kind === 'boss_rush_starter'
          ? Number(source.y || 0) - 82 + Math.floor(Number(option.slotIndex ?? index) / 5) * 150
          : Number(source.y || 0) - 4,
        r: 20,
        dwellMode: true,
        dwell: this.upgradeDwell.selectionEventId === pending.selectionEventId
          && this.upgradeDwell.optionId === option.id ? this.upgradeDwell.seconds : 0,
        side: pending.kind === 'boss_rush_starter'
          ? ((Number(option.slotIndex ?? index) % 5) < 2.5 ? 'left' : 'right')
          : (index < count / 2 ? 'left' : 'right'),
        picksRemaining: Math.max(1, Number(pending.picksRemaining || 1)),
        choiceTotal: Math.max(count, Number(pending.choiceTotal || count)),
        source: pending.kind === 'boss_rush_starter' ? 'boss_rush_starter' : '',
        networkChoice: true,
      }));
    }

    _updateUpgradeDwell(localPlayer, state, fixedDelta) {
      const choices = this._upgradePresentationPickups(state);
      if (!localPlayer || !choices.length) {
        this.upgradeDwell = { selectionEventId: '', optionId: '', seconds: 0, sent: false };
        return;
      }
      const dwellRadius = Number(this.neo.AB_CHEST_DWELL_RADIUS || 44);
      const dwellTarget = Number(this.neo.AB_CHEST_DWELL_SECONDS || 2.2);
      const inside = choices
        .map(choice => ({ choice, distance: Math.hypot(choice.x - localPlayer.x, choice.y - localPlayer.y) }))
        .filter(entry => entry.distance < dwellRadius)
        .sort((first, second) => first.distance - second.distance)[0]?.choice;
      if (!inside) {
        this.upgradeDwell.seconds = Math.max(0, Number(this.upgradeDwell.seconds || 0) - fixedDelta * 1.5);
        return;
      }
      if (this.upgradeDwell.selectionEventId !== inside.selectionEventId || this.upgradeDwell.optionId !== inside.optionId) {
        this.upgradeDwell = { selectionEventId: inside.selectionEventId, optionId: inside.optionId, seconds: 0, sent: false };
      }
      this.upgradeDwell.seconds = Math.min(dwellTarget, this.upgradeDwell.seconds + fixedDelta);
      if (this.upgradeDwell.seconds < dwellTarget || this.upgradeDwell.sent) return;
      this.upgradeDwell.sent = true;
      try {
        this.session.sendUpgrade(inside.selectionEventId, inside.optionId);
      } catch {
        this.upgradeDwell.sent = false;
      }
    }

    _consumeGameplayEvents(events, authorityTick = this.latestAuthorityTick) {
      const now = root.performance?.now?.() || Date.now();
      const localPlayerId = this._sessionPlayerId();
      events.forEach(event => {
        if (!event?.eventId || this.seenGameplayEvents.has(event.eventId)) return;
        this.seenGameplayEvents.add(event.eventId);
        if (this.seenGameplayEvents.size > 512) this.seenGameplayEvents.delete(this.seenGameplayEvents.values().next().value);
        runServices.getClientRunServiceIntents?.(event.eventType, event.data || {}, localPlayerId).forEach(intent => {
          if (intent.kind === 'achievement' && intent.name === 'run:won') {
            const state = this.currentSample?.state || {};
            const localPlayer = state.players?.[localPlayerId] || {};
            const challengeModifiers = state.matchRules?.challengeModifiers || {};
            intent.data = {
              ...intent.data,
              elapsedSeconds: Number(state.elapsedSeconds || 0),
              playerHp: Math.round(Number(localPlayer.hp || 0)),
              gameMode: String(state.gameMode || 'normal'),
              difficulty: String(state.matchRules?.difficultyKey || 'medium'),
              challengeKeys: Object.keys(challengeModifiers).filter(key => challengeModifiers[key]),
              characterKey: localPlayer.characterKey || localPlayer.character || '',
            };
          }
          if (intent.kind === 'achievement') root.achievementEvents?.emit?.(intent.name, intent.data);
          else if (intent.kind === 'tutorial') this.neo.tutorialController?.signal?.(intent.name, intent.data);
        });
        this._recordActionAvailability(event);
        if (event.eventType === 'PLAYER_DOWNED') {
          const player = this.currentSample?.state?.players?.[event.data?.playerId];
          const member = this.latestLobbyState?.members?.find(candidate => candidate.playerId === event.data?.playerId);
          const name = event.data?.playerId === localPlayerId ? 'You are down' : `${player?.displayName || member?.displayName || 'A teammate'} is down`;
          this.neo.pushStatusToast?.({ text: name, label: 'DOWNED', accent: '#ff7082', holdMs: 3200 });
        } else if (event.eventType === 'PLAYER_REVIVED' || event.eventType === 'PLAYER_RESPAWNED') {
          const player = this.currentSample?.state?.players?.[event.data?.playerId];
          const member = this.latestLobbyState?.members?.find(candidate => candidate.playerId === event.data?.playerId);
          const name = event.data?.playerId === localPlayerId ? 'You are back in the fight' : `${player?.displayName || member?.displayName || 'A teammate'} is back`;
          this.neo.pushStatusToast?.({ text: name, label: 'REVIVED', accent: '#72e69c', holdMs: 2400 });
        }
        if (!this._isGameplayEventVisible(event)) return;
        if (event.eventType === 'ACTION_REJECTED' && event.data?.playerId === localPlayerId) {
          this._rejectPredictedCombatEvent(event.data?.predictionId);
          return;
        }
        const predicted = this._acknowledgePredictedCombatEvent(event, now);
        if (event.eventType === 'PLAYER_ABILITY_USED'
          && event.data?.playerId === localPlayerId
          && event.data?.abilityId === this.pendingHeldCharge?.abilityId) {
          this.pendingHeldCharge = null;
        }
        if (event.eventType === 'PLAYER_ATTACKED') {
          const weaponKey = event.data?.weaponKey || event.data?.attackKind;
          const sound = weaponKey === 'metao_fire_staff' ? 'fire_burn'
            : weaponKey === 'gelleh_lightning_spear' ? 'lightning_charge'
              : ['princess_wand'].includes(weaponKey) ? 'fire'
                : 'sword_swing';
          if (!predicted) this._playNetworkSfx(sound, event, authorityTick);
        }
        if (event.eventType === 'PLAYER_ABILITY_USED') {
          if (!predicted) this._playNetworkSfx(deriveAbilityPresentation(event.data).sound || 'lazer_blast', event, authorityTick);
        }
        if (event.eventType === 'PLAYER_HIT' && event.data?.playerId === localPlayerId
          && this.localPredictedPlayer && Number(event.data.knockbackMagnitude || 0) > 0) {
          movementRules.applyCampaignImpulse?.(
            this.localPredictedPlayer,
            Number(event.data.knockbackAngle || 0),
            Number(event.data.knockbackMagnitude || 0),
          );
        }
        if (event.eventType === 'PICKUP_COLLECTED' && event.data?.playerId === localPlayerId && event.data?.itemKey) {
          this.neo.pushItemNotification?.(event.data.itemKey, Math.max(1, Number(event.data.amount || 1)));
          // A duplicate roll gets the campaign's compact "Copied!" toast next
          // to the normal pickup card, exactly as collectItem presents it.
          if (Number(event.data.amount || 1) >= 2) this.neo.pushCopiedNotification?.(event.data.itemKey);
          this._playNetworkSfx('item_collect', event, authorityTick);
        }
        if (event.eventType === 'UPGRADE_APPLIED' && event.data?.playerId === localPlayerId && event.data?.itemKey) {
          this.neo.pushItemNotification?.(event.data.itemKey, Math.max(1, Number(event.data.amount || 1)));
          this._playNetworkSfx('item_collect', event, authorityTick);
        }
        if (event.eventType === 'SPECIAL_ROOM_CHOICE_APPLIED'
          && event.data?.playerId === localPlayerId
          && event.data?.rewardKey) {
          this.neo.pushItemNotification?.(event.data.rewardKey, 1);
          this._playNetworkSfx('item_collect', event, authorityTick);
        }
        if (event.eventType === 'SHOP_PURCHASED' && event.data?.playerId === localPlayerId) {
          if (event.data?.kind === 'item' && event.data?.key) this.neo.pushItemNotification?.(event.data.key, 1);
          else if (event.data?.kind === 'move' && event.data?.key) this.neo.pushMoveNotification?.(event.data.key, 1);
          else if (event.data?.kind === 'weapon' && event.data?.key) this.neo.pushWeaponNotification?.(event.data.key);
        }
        if (event.eventType === 'DESTRUCTIBLE_HIT' || event.eventType === 'DESTRUCTIBLE_BROKEN') {
          const data = event.data || {};
          // Reuse the authoritative prop from the mirrored room so the campaign
          // FX read its real size/kind; fall back to a stub at the event point.
          const prop = (this.neo.destructibles || []).find(candidate => (
            candidate.kind === data.obstacleKind
            && Math.abs(Number(candidate.x) - Number(data.x)) < 1
            && Math.abs(Number(candidate.y) - Number(data.y)) < 1
          )) || { kind: data.obstacleKind, x: Number(data.x), y: Number(data.y), r: 24, reinforced: !!data.reinforced };
          if (event.eventType === 'DESTRUCTIBLE_HIT') {
            this.neo.spawnDestructibleHitFx?.(prop, 1, {});
          } else if (data.obstacleKind === 'barrel') {
            this.neo.spawnBarrelExplosionFx?.(prop, {});
          } else {
            this.neo.spawnDestructibleBreakFx?.(prop, {});
            this._playNetworkSfx(data.obstacleKind === 'pot' ? 'break_pot' : 'break_furniture', event, authorityTick);
          }
        }
        // The provisional effect already began on the local input frame. Keep
        // its clock when the authority confirms it, rather than drawing/sounding
        // the same action a second time one network round trip later. Server
        // state still wins for movement, hits, projectiles and every outcome.
        if (predicted) {
          if (event.eventType === 'PLAYER_ABILITY_USED') this._applyAuthoritativeAbilityMovement(event.data);
        } else {
          this._spawnGameplayEventEffect(event);
        }
        if (['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP', 'PLAYER_ABILITY_USED', 'ENEMY_ATTACKED', 'ENEMY_TELEGRAPH', 'ENEMY_HIT', 'ENEMY_DEFEATED', 'PLAYER_HIT', 'PICKUP_COLLECTED', 'ROOM_CLEARED'].includes(event.eventType)) {
          this.combatEffects.push({ ...event, startedAt: predicted?.startedAt || now });
        }
      });
      this.combatEffects = this.combatEffects.filter(effect => {
        const moveKey = effect.data?.abilityId;
        const authoredDuration = Number(MOVE_BASE_STATS[moveKey]?.duration || 0);
        return now - effect.startedAt < Math.max(700, authoredDuration * 1000 + 120);
      });
      this.pendingCombatPredictions = this.pendingCombatPredictions.filter(prediction => (
        now - prediction.startedAt < PREDICTED_COMBAT_CONFIRMATION_MS
      ));
      this.predictedProjectiles = this.predictedProjectiles.filter(projectile => now < projectile.expiresAt);
    }

    _playNetworkSfx(sound, event, authorityTick = this.latestAuthorityTick) {
      const eventTick = Number(event?.data?.tick);
      const referenceTick = Math.max(0, Number(authorityTick) || 0, Number(this.currentSample?.state?.tick) || 0);
      if (Number.isFinite(eventTick) && referenceTick - eventTick > NETWORK_SFX_MAX_EVENT_AGE_TICKS) return false;
      this.neo.playSfx?.(sound, { maxStartDelayMs: NETWORK_SFX_MAX_DECODE_DELAY_MS });
      return true;
    }

    _acknowledgePredictedCombatEvent(event, now) {
      const localPlayerId = this._sessionPlayerId();
      const data = event.data || {};
      if (data.playerId !== localPlayerId) return null;
      const predictionIndex = this.pendingCombatPredictions.findIndex(prediction => (
        (data.predictionId
          ? prediction.event.eventId === data.predictionId
          : prediction.event.eventType === event.eventType)
        && prediction.event.eventType === event.eventType
        && prediction.event.data?.playerId === data.playerId
        && (event.eventType !== 'PLAYER_ABILITY_USED'
          || prediction.event.data?.abilityId === data.abilityId)
        && now - prediction.startedAt < PREDICTED_COMBAT_CONFIRMATION_MS
      ));
      if (predictionIndex < 0) return null;
      const [prediction] = this.pendingCombatPredictions.splice(predictionIndex, 1);
      this.combatEffects = this.combatEffects.filter(effect => effect.eventId !== prediction.event.eventId);
      this.predictedProjectiles = this.predictedProjectiles.filter(projectile => projectile.predictionId !== prediction.event.eventId);
      return prediction;
    }

    _rejectPredictedCombatEvent(predictionId) {
      if (!predictionId) return;
      if (this.pendingHeldCharge?.predictionId === predictionId) this.pendingHeldCharge = null;
      const predictionIndex = this.pendingCombatPredictions.findIndex(prediction => prediction.event.eventId === predictionId);
      if (predictionIndex < 0) return;
      const [prediction] = this.pendingCombatPredictions.splice(predictionIndex, 1);
      this.combatEffects = this.combatEffects.filter(effect => effect.eventId !== prediction.event.eventId);
      this.predictedProjectiles = this.predictedProjectiles.filter(projectile => projectile.predictionId !== prediction.event.eventId);
    }

    _predictCombatEvent(eventType, data, eventId = null) {
      const now = root.performance?.now?.() || Date.now();
      const event = {
        eventId: eventId || `predicted:${++this.predictedCombatSequence}`,
        eventType,
        data,
      };
      const prediction = { event, startedAt: now };
      this.pendingCombatPredictions.push(prediction);
      if (eventType === 'PLAYER_ATTACKED') {
        const weaponKey = data.weaponKey || data.attackKind;
        const sound = weaponKey === 'metao_fire_staff' ? 'fire_burn'
          : weaponKey === 'gelleh_lightning_spear' ? 'lightning_charge'
            : weaponKey === 'princess_wand' ? 'fire' : 'sword_swing';
        this.neo.playSfx?.(sound);
      } else if (eventType === 'PLAYER_ABILITY_USED') {
        this.neo.playSfx?.(deriveAbilityPresentation(data).sound || 'lazer_blast');
      }
      this._spawnGameplayEventEffect(event);
      this.combatEffects.push({ ...event, startedAt: now });
      return prediction;
    }

    _hasPendingCombatPrediction(eventType, abilityId = null) {
      return this.pendingCombatPredictions.some(prediction => (
        prediction.event.eventType === eventType
        && (abilityId == null || prediction.event.data?.abilityId === abilityId)
      ));
    }

    _predictLocalAttack() {
      const player = this.localPredictedPlayer;
      if (!player) return;
      return this._predictCombatEvent('PLAYER_ATTACKED', {
        playerId: player.id,
        roomId: player.roomId,
        weaponKey: player.weaponKey || player.equippedWeapon || player.actionKind || 'melee',
        attackKind: player.weaponKey || player.equippedWeapon || player.actionKind || 'melee',
        aimDirection: this.aimDirection,
        originX: Number(player.x || 0),
        originY: Number(player.y || 0),
      });
    }

    _predictLocalAbility(abilityId, slot, options = {}) {
      const player = this.localPredictedPlayer;
      if (!player) return;
      const stats = MOVE_BASE_STATS[abilityId] || {};
      const presentation = deriveAbilityPresentation({ abilityId, slot });
      const dashMoveX = Math.max(-1, Math.min(1, Number(options.dashMoveX) || 0));
      const dashMoveY = Math.max(-1, Math.min(1, Number(options.dashMoveY) || 0));
      const actionAimDirection = slot === 'dash' && Math.hypot(dashMoveX, dashMoveY) > 0.15
        ? Math.atan2(dashMoveY, dashMoveX)
        : this.aimDirection;
      const chargeRatio = clamp(Number(options.chargeRatio || 0), 0, 1);
      const originX = Number(player.x || 0);
      const originY = Number(player.y || 0);
      const targetX = Number.isFinite(Number(options.targetX)) ? Number(options.targetX)
        : Number.isFinite(Number(this.neo.mouse?.worldX)) ? Number(this.neo.mouse.worldX) : undefined;
      const targetY = Number.isFinite(Number(options.targetY)) ? Number(options.targetY)
        : Number.isFinite(Number(this.neo.mouse?.worldY)) ? Number(this.neo.mouse.worldY) : undefined;
      const chargedProjectile = planChargedProjectilePreview(abilityId, player, {
        originX, originY, targetX, targetY,
      }, chargeRatio);
      const areaMove = planAreaMovePreview(abilityId, player, this.currentSample?.state, actionAimDirection);
      const radius = chargedProjectile?.radius ?? areaMove?.radius ?? (abilityId === 'healing_zone' ? 62 * (1 + chargeRatio)
          : abilityId === 'nimrod_stomp' ? 108 + chargeRatio * 54
            : Number(stats.range || (slot === 'smash' ? 140 : 34)));
      const data = {
        playerId: player.id,
        roomId: player.roomId,
        characterKey: player.characterKey,
        slot,
        abilityId,
        mode: presentation.kind || slot,
        aimDirection: actionAimDirection,
        originX,
        originY,
        targetX,
        targetY,
        destinationX: originX,
        destinationY: originY,
        effectRadius: radius,
      };
      const floor = this.currentSample?.state?.floorState || {};
      const dash = planPredictedDashPreview({
        abilityId, player, state: this.currentSample?.state, floor,
        originX, originY, aimDirection: actionAimDirection, moveX: dashMoveX, moveY: dashMoveY,
        targetX, targetY, chargeRatio,
      });
      if (dash) {
        data.destinationX = dash.destinationX;
        data.destinationY = dash.destinationY;
        if (Number.isFinite(Number(dash.effectRadius))) data.effectRadius = Number(dash.effectRadius);
        if (dash.kind === 'glide') {
          data.dashVx = dash.vx;
          data.dashVy = dash.vy;
        }
      }
      const prediction = this._predictCombatEvent('PLAYER_ABILITY_USED', data);
      if (presentation.kind === 'projectile') this._predictAbilityProjectile(prediction, data, chargeRatio);
      if (CONTINUOUS_BEAM_MOVES.has(abilityId)) this._startPredictedBeamPresentation(abilityId);
      return prediction;
    }

    _startPredictedHeldCharge(abilityId, slot, button, predictionId = null) {
      if (this.pendingHeldCharge?.abilityId === abilityId) return;
      const profile = HOLD_TO_CHARGE_MOVES[abilityId];
      const player = this.localPredictedPlayer;
      if (!player || !profile) return;
      this.pendingHeldCharge = {
        abilityId, moveKey: abilityId, slot, button, startAt: root.performance?.now?.() || Date.now(),
        maxChargeTicks: profile.maxChargeTicks, predictionId,
      };
    }

    _releasePredictedHeldCharge() {
      const charge = this.pendingHeldCharge;
      if (!charge) return;
      this.pendingHeldCharge = null;
      const now = root.performance?.now?.() || Date.now();
      const ratio = clamp((now - charge.startAt) / (charge.maxChargeTicks * INPUT_INTERVAL_MS), 0, 1);
      if (charge.slot === 'melee' && charge.abilityId === 'mooggy_swipe') {
        this._predictLocalMooggySwipe(charge, ratio);
        return;
      }
      this._predictLocalAbility(charge.abilityId, charge.slot, { chargeRatio: ratio });
    }

    _predictLocalMooggySwipe(charge, chargeRatio) {
      const player = this.localPredictedPlayer;
      if (!player) return;
      const swipe = moveEffects.resolveCampaignMooggySwipe?.({
        chargeRatio,
        godMode: !!player.godMode,
        baseKnockback: 140,
        itemBleedChance: player.itemStats?.bleedChance,
      });
      if (!swipe) throw new Error('Shared Mooggy Swipe policy is unavailable');
      return this._predictCombatEvent('PLAYER_ATTACKED', {
        playerId: player.id,
        roomId: player.roomId,
        characterKey: player.characterKey,
        weaponKey: 'mooggy_swipe',
        attackKind: 'mooggy_swipe',
        attackMode: 'charged_sweep',
        aimDirection: this.aimDirection,
        originX: Number(player.x || 0),
        originY: Number(player.y || 0),
        range: swipe.range,
        arc: swipe.arc,
        chargeRatio: swipe.chargeRatio,
      }, charge.predictionId);
    }

    _startPredictedBeamPresentation(moveKey) {
      const now = root.performance?.now?.() || Date.now();
      const durationMs = Math.max(100, Number(MOVE_BASE_STATS[moveKey]?.duration || 1.2) * 1000);
      this.localBeamReleaseRequested = false;
      this.pendingBeamPresentation = { moveKey, startAt: now, untilAt: now + durationMs, angle: this.aimDirection };
    }

    _predictAbilityProjectile(prediction, data, chargeRatio) {
      const moveKey = data.abilityId;
      const stats = MOVE_BASE_STATS[moveKey] || {};
      const descriptor = planChargedProjectilePreview(moveKey, this.localPredictedPlayer, data, chargeRatio);
      const radius = descriptor?.radius ?? 7;
      const speed = descriptor?.speed ?? 520;
      const now = root.performance?.now?.() || Date.now();
      const lifetimeMs = Number.isFinite(Number(descriptor?.lifeSeconds))
        ? Number(descriptor.lifeSeconds) * 1000
        // Ghost Ball's actual expiry is contact-dependent. This only caps the
        // provisional visual while it waits for the real authority snapshot.
        : descriptor?.kind === 'ghost_ball'
          ? PREDICTED_COMBAT_CONFIRMATION_MS
        : Math.max(360, Number(stats.range || 320) / Math.max(1, speed) * 1000);
      const angle = Number(data.aimDirection || 0);
      this.predictedProjectiles.push({
        id: `${prediction.event.eventId}:projectile`, predictionId: prediction.event.eventId,
        kind: descriptor?.kind || moveKey, ownerId: data.playerId, roomId: data.roomId,
        x: Number(data.originX || 0) + Math.cos(angle) * (18 + radius * 0.4),
        y: Number(data.originY || 0) + Math.sin(angle) * (18 + radius * 0.4),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: radius, radius, enemy: false, createdAt: now, expiresAt: now + lifetimeMs,
        life: lifetimeMs / 1000, maxLife: lifetimeMs / 1000, trail: [],
      });
    }

    _projectPredictedProjectiles(now) {
      this.predictedProjectiles = this.predictedProjectiles.filter(projectile => now < projectile.expiresAt);
      return this.predictedProjectiles.map(projectile => {
        const ageSeconds = Math.max(0, now - projectile.createdAt) / 1000;
        return {
          ...projectile,
          x: projectile.x + projectile.vx * ageSeconds,
          y: projectile.y + projectile.vy * ageSeconds,
          life: Math.max(0, projectile.expiresAt - now) / 1000,
        };
      });
    }

    _isGameplayEventVisible(event) {
      const state = this.currentSample?.state;
      if (!state) return true;
      const localPlayerId = this._sessionPlayerId();
      const viewpointPlayer = state.players?.[this._viewpointPlayerId(state, localPlayerId)];
      if (!viewpointPlayer) return true;
      const data = event.data || {};
      const eventEntity = state.enemies?.[data.enemyId]
        || state.players?.[data.playerId]
        || state.pickups?.[data.pickupId];
      const eventRoomId = data.roomId || eventEntity?.roomId;
      return !eventRoomId || eventRoomId === viewpointPlayer.roomId;
    }

    _applyAuthoritativeAbilityMovement(data = {}) {
      const isLocalCaster = data.playerId === this._sessionPlayerId() && this.localPredictedPlayer;
      if (!isLocalCaster) return;
      const destinationX = Number.isFinite(Number(data.destinationX))
        ? Number(data.destinationX) : Number(this.localPredictedPlayer.x || 0);
      const destinationY = Number.isFinite(Number(data.destinationY))
        ? Number(data.destinationY) : Number(this.localPredictedPlayer.y || 0);
      const presentation = deriveAbilityPresentation(data);
      const kind = String(presentation.kind || data.mode || '');
      // The plain glide dash isn't a teleport: it moves the hero over ~0.16s
      // via dashUntilTick/dashVx/dashVy, which prediction already integrates.
      // Snapping to destination here would freeze it at its start point, so we
      // start the glide locally and let predictPosition carry it instead.
      if (data.abilityId === 'dash') {
        const serverTick = Number(this.currentSample?.state?.tick || 0);
        this.localPredictedPlayer.dashUntilTick = serverTick + Math.round(0.16 * 20);
        this.localPredictedPlayer.dashVx = Number(data.dashVx || 0);
        this.localPredictedPlayer.dashVy = Number(data.dashVy || 0);
      } else if (['dash', 'warp', 'dash_aoe'].includes(kind)) {
        this.localPredictedPlayer.x = destinationX;
        this.localPredictedPlayer.y = destinationY;
        this.localPredictedPlayer.vx = 0;
        this.localPredictedPlayer.vy = 0;
      }
    }

    _playLocalPlayerHurtSfx(damage, maxHp) {
      const dealt = Number(damage || 0);
      if (!(dealt > 0)) return;
      if (dealt < Math.max(1, Number(maxHp || 0) * PLAYER_HURT_SFX_MIN_RATIO)) return;
      const now = Date.now();
      if (now - (this._lastPlayerHurtSfxAt || 0) < PLAYER_HURT_SFX_MIN_GAP_MS) return;
      this._lastPlayerHurtSfxAt = now;
      // Late audio on a hit you already saw land is worse than no audio.
      this.neo.playSfx?.('player_hurt', { maxStartDelayMs: NETWORK_SFX_MAX_DECODE_DELAY_MS });
    }

    _spawnGameplayEventEffect(event) {
      const state = this.currentSample?.state;
      const data = event.data || {};
      const entity = state?.enemies?.[data.enemyId] || state?.players?.[data.playerId];
      if (!entity) return;
      if (event.eventType === 'BOSS_INTRO') {
        // The authority selected the campaign's character-aware script. Reuse
        // the normal typewriter dialogue instead of inventing a network overlay.
        const lines = Array.isArray(data.lines) ? data.lines.filter(line => line?.speaker && line?.text) : [];
        if (lines.length && !this.neo.uiController?.isDialogueOpen?.()) {
          this.neo.setShopPanelOpen?.(false);
          this.neo.setInventoryPanelOpen?.(false);
          this.neo.clearGameplayInput?.();
          this._flushNeutralInput();
          this.neo.uiController?.playDialogue?.(lines, { returnState: 'play' });
        }
      } else if (event.eventType === 'ENEMY_HIT' || event.eventType === 'PLAYER_HIT') {
        const color = event.eventType === 'PLAYER_HIT' ? '#ff6b75'
          : data.attackKind === 'bleed' ? '#ff536d' : '#ffffff';
        this.neo.spawnDamagePopup?.(entity.x, entity.y - Number(entity.radius || 18) - 12, Number(data.damage || 0), { color, size: 18 });
        this.neo.ringBurst?.(entity.x, entity.y, Number(entity.radius || 18) + 5, color, 0.28);
        // Campaign hit feel: directional screenshake scaled to impact weight,
        // driven off the authoritative ENEMY_HIT/PLAYER_HIT event (matches
        // applyHitFeel in combat.js). Chip/DoT ticks (no knockback, tiny damage)
        // are skipped so a held beam doesn't jitter the camera every frame.
        const localPlayerId = this._sessionPlayerId();
        const maxHp = Math.max(1, Number(entity.maxHealth || entity.maxHp || Number(data.damage || 0) * 6));
        const ratio = clamp(Number(data.damage || 0) / maxHp, 0, 1);
        const isPlayerHit = event.eventType === 'PLAYER_HIT';
        const relevant = isPlayerHit ? data.playerId === localPlayerId : true;
        // Only the local player's own hits get the hurt grunt. A remote player
        // being shot across the room is their feedback, not yours.
        if (isPlayerHit && relevant) {
          this._playLocalPlayerHurtSfx(Number(data.damage || 0), maxHp);
        }
        if (relevant && (data.crit || ratio >= 0.04 || Number(data.knockback || 0) >= 120)) {
          const heavy = clamp(ratio * 2.4, 0, 1);
          const trauma = (data.crit ? 0.32 : 0.16) + heavy * 0.3;
          const kick = (data.crit ? 5 : 2.5) + heavy * 6;
          const angle = Math.atan2(entity.y - (this.localPredictedPlayer?.y ?? entity.y), entity.x - (this.localPredictedPlayer?.x ?? entity.x));
          this.neo.addTrauma?.(trauma, isPlayerHit ? angle + Math.PI : angle, kick);
          if (data.crit || heavy > 0.6) this.neo.addHitstop?.(0.04);
        }
      } else if (event.eventType === 'ENEMY_DEFEATED') {
        this.neo.ringBurst?.(entity.x, entity.y, Number(entity.radius || 20) + 8, '#ff7592', 0.48);
        this.neo.playSfx?.('enemy_hit');
      } else if (event.eventType === 'ENEMY_SPOKE') {
        // Boss voice lines ride authoritative events into the normal campaign
        // speech bubbles (Queen's finisher bark, Bowman's SONICHU, etc.).
        const speaker = this.presentationEnemyActors.get(String(data.enemyId)) || entity;
        if (speaker && data.text) this.neo.sayOverEntity?.(speaker, String(data.text), { holdTime: 1.6 });
      } else if (event.eventType === 'PICKUP_COLLECTED') {
        // Match the campaign's per-type pickup presentation: coins chime,
        // potions show the heal popup, and items only play item_collect
        // (handled with the notification card in _consumeGameplayEvents).
        if (data.pickupType === 'coin') {
          this.neo.playSfx?.('coin');
        } else if (data.pickupType === 'potion' && Number(data.healedAmount || 0) > 0) {
          this.neo.spawnHealPopup?.(entity.x, entity.y - 20, Number(data.healedAmount));
        }
      } else if (event.eventType === 'PLAYER_ABILITY_USED') {
        const presentation = deriveAbilityPresentation(data);
        const originX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(entity.x);
        const originY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(entity.y);
        const destinationX = Number.isFinite(Number(data.destinationX)) ? Number(data.destinationX) : Number(entity.x);
        const destinationY = Number.isFinite(Number(data.destinationY)) ? Number(data.destinationY) : Number(entity.y);
        const radius = Math.max(1, Number(data.effectRadius || (data.slot === 'smash' ? 140 : 34)));
        const kind = String(presentation.kind || data.mode || '');
        this._applyAuthoritativeAbilityMovement(data);
        if (['aoe', 'dash_aoe'].includes(kind) && typeof this.neo.spawnAoeShockwave === 'function') {
          const impactX = kind === 'dash_aoe' ? destinationX : originX;
          const impactY = kind === 'dash_aoe' ? destinationY : originY;
          this.neo.addTrauma?.(0.72, Math.PI / 2, 24);
          this.neo.addHitstop?.(0.05);
          this.neo.spawnAoeShockwave(impactX, impactY, radius, presentation.color, presentation.style);
          this.neo.ringBurst?.(impactX, impactY, Math.max(18, radius - 24), presentation.color, 0.44);
        } else if (['dash', 'warp'].includes(kind)) {
          this.neo.ringBurst?.(originX, originY, 18, presentation.color, 0.35);
          this.neo.ringBurst?.(destinationX, destinationY, 18, presentation.color, 0.35);
        } else {
          this.neo.ringBurst?.(originX, originY, data.slot === 'smash' ? 34 : 18, presentation.color, 0.42);
          if (['status', 'shield', 'support', 'aura', 'summon'].includes(kind)) {
            const moveName = this.neo.MOVE_DEFS?.[data.abilityId]?.name || String(data.abilityId || '').replace(/_/g, ' ');
            this.neo.spawnParticle?.({
              x: originX, y: originY - 24, life: 0.65,
              text: String(moveName).toUpperCase(), c: presentation.color,
            });
          }
        }
      } else if (event.eventType === 'ABILITY_ENTITY_PULSED') {
        const presentation = deriveAbilityPresentation({ abilityId: data.abilityId });
        const pulseX = Number(data.x || 0);
        const pulseY = Number(data.y || 0);
        const radius = Math.max(8, Number(data.radius || 32));
        this.neo.ringBurst?.(pulseX, pulseY, Math.max(12, radius * 0.55), presentation.color, 0.32);
        if (['chaos_burst', 'lightning_columns', 'holy_turrets'].includes(data.abilityId)) {
          this.neo.spawnAoeShockwave?.(pulseX, pulseY, radius, presentation.color, 'light');
        }
      }
    }

    _onPointerMove(event) {
      if (!this.active || !this.localPredictedPlayer || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = (event.clientX - rect.left) * (this.canvas.width / Math.max(1, rect.width));
      const canvasY = (event.clientY - rect.top) * (this.canvas.height / Math.max(1, rect.height));
      this.aimDirection = this.neo.updatePointerAimWorld?.({
        canvasX,
        canvasY,
        canvas: this.canvas,
        camera: this.camera,
        player: this.localPredictedPlayer,
        splitScreen: false,
      }) ?? this.aimDirection;
    }

    _readMovement() {
      let moveX = 0;
      let moveY = 0;
      const actionDirections = {
        'action:up': [0, -1], 'action:down': [0, 1],
        'action:left': [-1, 0], 'action:right': [1, 0],
      };
      this.keys.forEach(code => {
        const direction = actionDirections[code] || MOVEMENT_KEYS.get(code);
        if (direction) {
          moveX += direction[0];
          moveY += direction[1];
        }
      });
      const normalizedPad = root.NeoGamepad?.[0];
      const gamepads = root.navigator?.getGamepads?.();
      const gamepad = normalizedPad?.connected || normalizedPad?.active
        ? normalizedPad
        : (gamepads ? Array.from(gamepads).find(Boolean) : null);
      if (gamepad) {
        const rawX = normalizedPad === gamepad ? gamepad.moveX : gamepad.axes?.[0];
        const rawY = normalizedPad === gamepad ? gamepad.moveY : gamepad.axes?.[1];
        const axisX = Math.abs(Number(rawX) || 0) > 0.18 ? Number(rawX) : 0;
        const axisY = Math.abs(Number(rawY) || 0) > 0.18 ? Number(rawY) : 0;
        if (Math.hypot(axisX, axisY) > Math.hypot(moveX, moveY)) {
          moveX = axisX;
          moveY = axisY;
        }
        const rawAimX = normalizedPad === gamepad ? gamepad.aimX : gamepad.axes?.[2];
        const rawAimY = normalizedPad === gamepad ? gamepad.aimY : gamepad.axes?.[3];
        const aimX = Math.abs(Number(rawAimX) || 0) > 0.22 ? Number(rawAimX) : 0;
        const aimY = Math.abs(Number(rawAimY) || 0) > 0.22 ? Number(rawAimY) : 0;
        if (aimX || aimY) this.aimDirection = Math.atan2(aimY, aimX);
        if (normalizedPad !== gamepad) {
          const attackPressed = !!gamepad.buttons?.[0]?.pressed;
          if (attackPressed && !this.gamepadAttackPressed) this._attack();
          this.gamepadAttackPressed = attackPressed;
        }
      } else {
        this.gamepadAttackPressed = false;
      }
      // Touch stick, same treatment as the gamepad above: the on-screen joystick
      // is the only movement source on mobile, and without this branch a network
      // run reads keyboard and gamepad only, so phones cannot move at all.
      const touch = root.NeoTouch;
      if (touch?.active) {
        const touchX = Math.abs(Number(touch.moveX) || 0) > TOUCH_DEADZONE ? Number(touch.moveX) : 0;
        const touchY = Math.abs(Number(touch.moveY) || 0) > TOUCH_DEADZONE ? Number(touch.moveY) : 0;
        if (Math.hypot(touchX, touchY) > Math.hypot(moveX, moveY)) {
          moveX = touchX;
          moveY = touchY;
        }
      }
      const movement = normalizeMovement(moveX, moveY);
      // Network input must use the same camera-relative controls as the normal
      // campaign update loop. Without this, W continued to mean world-up while
      // the first-person camera faced world-right, which felt inverted.
      return movementRules.resolveCampaignMovementInput
        ? movementRules.resolveCampaignMovementInput(movement.moveX, movement.moveY, this.neo.getFirstPersonYaw?.())
        : movement;
    }

    _syncGamepadActions() {
      const pad = root.NeoGamepad?.[0];
      if (!pad?.active) {
        this.gamepadLaserHeld = false;
        this.gamepadSmashHeld = false;
        this.gamepadDashHeld = false;
        this.gamepadMeleeHeld = false;
        this.previousGamepadActions = { slash: false, laser: false, smash: false, dash: false };
        return;
      }
      const current = {
        slash: !!pad.slash,
        laser: !!pad.laser,
        smash: !!pad.smash,
        dash: !!pad.dash,
      };
      // Prime packets are emitted from the edge handlers below. Publish the
      // complete physical sample first so those packets cannot clear another
      // button that became held in the same controller poll.
      this.gamepadLaserHeld = current.laser;
      this.gamepadSmashHeld = current.smash;
      this.gamepadDashHeld = current.dash;
      this.gamepadMeleeHeld = current.slash;
      if (!this._isInputBlocked() && !this.localPredictedPlayer?.downed) {
        const consume = action => root.NeoGamepad?.consumeAction?.(0, action);
        const queued = {
          slash: consume('slash'), laser: consume('laser'),
          smash: consume('smash'), dash: consume('dash'),
        };
        if (queued.slash || current.slash && !this.previousGamepadActions.slash) this._attack();
        if (queued.laser || current.laser && !this.previousGamepadActions.laser) this._useSlot('laser');
        if (queued.smash || current.smash && !this.previousGamepadActions.smash) this._useSlot('smash');
        if (queued.dash || current.dash && !this.previousGamepadActions.dash) this._useSlot('dash');
        const interactQueued = consume('interact');
        const ascendQueued = consume('ascend');
        if (interactQueued || ascendQueued) this._interact();
        if (consume('activateAll')) this.activateAllEquipment();
        for (let index = 1; index <= 8; index += 1) {
          if (consume(`tool${index}`)) this.activateEquipmentSlot(index - 1);
        }
      }
      this.previousGamepadActions = current;
    }

    _syncTouchActions() {
      const touch = root.NeoTouch;
      const queued = touch?.queuedActions || {};
      const current = {
        slash: !!touch?.active && !!touch.slash,
        laser: !!touch?.active && !!touch.laser,
        smash: !!touch?.active && !!touch.smash,
        ascend: !!touch?.active && !!touch.ascend,
        dash: !!touch?.active && !!touch.dash,
        beamMash: !!touch?.active && !!touch.beamMash,
      };
      // Keep prime packets complete when multiple touch buttons begin in the
      // same sample, before their reliable actions are sent.
      this.touchLaserHeld = current.laser;
      this.touchSmashHeld = current.smash;
      this.touchDashHeld = current.dash;
      this.touchMeleeHeld = current.slash;
      if (touch) touch.queuedActions = {};
      if (touch?.active && Math.hypot(Number(touch.lastAimX || 0), Number(touch.lastAimY || 0)) > 0.2) {
        this.aimDirection = Math.atan2(Number(touch.lastAimY || 0), Number(touch.lastAimX || 0));
      }
      if (!this._isInputBlocked() && !this.localPredictedPlayer?.downed) {
        if (queued.slash || current.slash && !this.previousTouchActions.slash) this._attack();
        if (queued.laser || current.laser && !this.previousTouchActions.laser) this._useSlot('laser');
        if (queued.smash || current.smash && !this.previousTouchActions.smash) this._useSlot('smash');
        if (queued.dash || current.dash && !this.previousTouchActions.dash) this._useSlot('dash');
        if (queued.ascend || current.ascend && !this.previousTouchActions.ascend) this._interact();
        if (queued.beamMash || current.beamMash && !this.previousTouchActions.beamMash) this._useSlot('laser');
      }
      this.previousTouchActions = current;
    }

    _clearHeldInputSources() {
      this.keys.clear();
      this.laserHeld = false;
      this.keyboardLaserHeld = false;
      this.gamepadLaserHeld = false;
      this.touchLaserHeld = false;
      this.keyboardSmashHeld = false;
      this.gamepadSmashHeld = false;
      this.touchSmashHeld = false;
      this.keyboardDashHeld = false;
      this.gamepadDashHeld = false;
      this.touchDashHeld = false;
      this.gamepadMeleeHeld = false;
      this.touchMeleeHeld = false;
      const pad = root.NeoGamepad?.[0];
      const touch = root.NeoTouch;
      const rawGamepads = root.navigator?.getGamepads?.();
      let rawGamepad = null;
      if (rawGamepads) {
        for (let index = 0; index < rawGamepads.length; index += 1) {
          if (rawGamepads[index]) {
            rawGamepad = rawGamepads[index];
            break;
          }
        }
      }
      this.gamepadAttackPressed = !!rawGamepad?.buttons?.[0]?.pressed;
      this.previousTouchActions = {
        slash: !!touch?.slash,
        laser: !!touch?.laser,
        smash: !!touch?.smash,
        ascend: !!touch?.ascend,
        dash: !!touch?.dash,
        beamMash: !!touch?.beamMash,
      };
      this.previousGamepadActions = {
        slash: !!pad?.slash, laser: !!pad?.laser, smash: !!pad?.smash, dash: !!pad?.dash,
      };
      this.neo.clearGameplayInput?.();
      if (this.neo.mouse) {
        this.neo.mouse.down = false;
        this.neo.mouse.right = false;
        this.neo.mouse.downQueued = false;
        this.neo.mouse.rightQueued = false;
      }
      if (this.neo.keys) {
        Object.keys(this.neo.keys).forEach(key => {
          this.neo.keys[key] = false;
        });
      }
      root.NeoGamepad?.clearQueuedActions?.(0);
      if (touch) {
        ['slash', 'laser', 'smash', 'ascend', 'dash', 'beamMash'].forEach(action => {
          touch[action] = false;
        });
        touch.queuedActions = {};
        touch.moveX = 0;
        touch.moveY = 0;
      }
    }

    _suspendInput() {
      this.inputSuspended = true;
      this._flushNeutralInput();
    }

    _resumeInput() {
      // Snapshot every physical controller edge before accepting input again.
      // A button queued or pressed while unfocused must require a fresh edge.
      this._clearHeldInputSources();
      this.inputSuspended = false;
    }

    _flushNeutralInput() {
      this._clearHeldInputSources();
      this._sendInput({
        forceNeutral: true,
        syncHeldSources: false,
        trackNeutralAcknowledgement: true,
      });
    }

    _buildInputSample({ additionalButton = 0, forceNeutral = false } = {}) {
      const inputBlocked = forceNeutral || this._isInputBlocked() || this.localPredictedPlayer?.downed;
      const movement = inputBlocked ? { moveX: 0, moveY: 0 } : this._readMovement();
      let buttons = 0;
      if (!inputBlocked) {
        const beamHeld = this.laserHeld || this.keyboardLaserHeld || this.gamepadLaserHeld || this.touchLaserHeld;
        const smashHeld = this.keyboardSmashHeld || this.gamepadSmashHeld || this.touchSmashHeld;
        const dashHeld = this.keyboardDashHeld || this.gamepadDashHeld || this.touchDashHeld;
        const meleeHeld = !!this.neo.isMouseActionHeld?.('slash') || this.gamepadMeleeHeld || this.touchMeleeHeld;
        buttons = (beamHeld ? BUTTON_LASER_HELD : 0)
          | (smashHeld ? BUTTON_SMASH_HELD : 0)
          | (dashHeld ? BUTTON_DASH_HELD : 0)
          | (meleeHeld ? BUTTON_MELEE_HELD : 0)
          | additionalButton;
      }
      return {
        ...movement,
        aimDirection: this.aimDirection,
        ...(Number.isFinite(Number(this.neo.mouse?.worldX)) ? { targetX: Number(this.neo.mouse.worldX) } : {}),
        ...(Number.isFinite(Number(this.neo.mouse?.worldY)) ? { targetY: Number(this.neo.mouse.worldY) } : {}),
        buttons,
      };
    }

    _sendInput({
      additionalButton = 0,
      forceNeutral = false,
      syncHeldSources = true,
      trackNeutralAcknowledgement = false,
    } = {}) {
      // Status is scalar session metadata; do not deep-clone the complete
      // authoritative GameState on every 20 Hz input sampling pass.
      const sessionStatus = this._sessionStatus();
      if (!this.active || sessionStatus !== 'running') return;
      const now = root.performance?.now?.() || Date.now();
      const hidden = this.document?.hidden === true || this.document?.visibilityState === 'hidden';
      const suspended = hidden || this.inputSuspended;
      const neutralRetryPending = this.pendingNeutralInputSequence != null;
      const neutralRetryDue = neutralRetryPending
        && this.neutralInputSendAttempts < MAX_NEUTRAL_INPUT_SEND_ATTEMPTS
        && (this.lastNeutralInputSentAt == null
          || now - this.lastNeutralInputSentAt >= NEUTRAL_INPUT_RETRY_INTERVAL_MS);

      if (!forceNeutral && neutralRetryDue) {
        forceNeutral = true;
        syncHeldSources = false;
        trackNeutralAcknowledgement = true;
      } else if (!forceNeutral && neutralRetryPending
        && this.neutralInputSendAttempts < MAX_NEUTRAL_INPUT_SEND_ATTEMPTS) {
        // Do not overtake an unacknowledged neutral boundary with freshly
        // focused physical intent. The next due sample remains neutral.
        return;
      } else if (suspended && !forceNeutral) {
        // A hidden or blurred client may only use its bounded neutral retry
        // budget. Never poll physical sources and rebuild abandoned intent.
        return;
      }
      if (!forceNeutral && (this._isInputBlocked() || this.localPredictedPlayer?.downed)) {
        this._clearHeldInputSources();
        forceNeutral = true;
        syncHeldSources = false;
        trackNeutralAcknowledgement = true;
      }
      if (trackNeutralAcknowledgement && neutralRetryPending && !neutralRetryDue) return;
      if (trackNeutralAcknowledgement
        && this.neutralInputSendAttempts >= MAX_NEUTRAL_INPUT_SEND_ATTEMPTS) return;
      if (syncHeldSources && !forceNeutral) {
        this._syncGamepadActions();
        this._syncTouchActions();
      }
      // The campaign uses first-person yaw as its canonical aim. Send that same
      // direction to authority instead of the stale top-down pointer angle.
      const firstPersonYaw = this.neo.getFirstPersonYaw?.();
      if (firstPersonYaw != null) this.aimDirection = firstPersonYaw;
      const input = this._buildInputSample({ additionalButton, forceNeutral });
      if (!(input.buttons & BUTTON_LASER_HELD)) {
        this.pendingBeamPresentation = null;
        this.localBeamReleaseRequested = true;
      }
      if (this.pendingHeldCharge && !(input.buttons & this.pendingHeldCharge.button)) {
        this._releasePredictedHeldCharge();
      }
      // Keep prediction current even if a frame was delayed. In normal play
      // requestAnimationFrame advances it more frequently; this is the bounded
      // 20 Hz fallback for throttled/minimal presentation hosts.
      this._advanceLocalPrediction(now);
      const previous = this.lastTransmittedInput;
      const movementOrButtonChanged = !previous
        || Math.abs(input.moveX - previous.moveX) > INPUT_VECTOR_EPSILON
        || Math.abs(input.moveY - previous.moveY) > INPUT_VECTOR_EPSILON
        || input.buttons !== previous.buttons;
      const aimChanged = !previous || angularDistance(input.aimDirection, previous.aimDirection) > INPUT_AIM_EPSILON;
      const targetChanged = !previous
        || Math.hypot(Number(input.targetX || 0) - Number(previous.targetX || 0), Number(input.targetY || 0) - Number(previous.targetY || 0)) > 4;
      const sinceLastSend = Math.max(0, now - this.lastInputSentAt);
      const shouldTransmit = trackNeutralAcknowledgement
        || movementOrButtonChanged
        || (aimChanged && sinceLastSend >= INPUT_AIM_SEND_INTERVAL_MS)
        || (targetChanged && sinceLastSend >= INPUT_AIM_SEND_INTERVAL_MS)
        || sinceLastSend >= INPUT_HEARTBEAT_MS;
      if (shouldTransmit) {
        try {
          const inputSequence = this.session.sendInput(input);
          const movementChanged = !this.lastLocalPredictionInput
            || Math.abs(input.moveX - Number(this.lastLocalPredictionInput.moveX || 0)) > INPUT_VECTOR_EPSILON
            || Math.abs(input.moveY - Number(this.lastLocalPredictionInput.moveY || 0)) > INPUT_VECTOR_EPSILON;
          if (movementChanged) {
            this.lastMovementInputSequence = inputSequence;
            // The fractional remainder happened before this sampled transition;
            // never reinterpret that elapsed time under the new direction.
            this.localPredictionAccumulatorMs = 0;
          }
          if (trackNeutralAcknowledgement) {
            const numericInputSequence = Number(inputSequence);
            if (Number.isInteger(numericInputSequence) && numericInputSequence >= 0) {
              if (this.pendingNeutralInputSequence == null) {
                this.pendingNeutralInputSequence = numericInputSequence;
              }
              this.neutralInputSendAttempts += 1;
              this.lastNeutralInputSentAt = now;
            }
          }
          this.lastLocalPredictionInput = { ...input };
          this.lastTransmittedInput = { ...input };
          this.lastInputSentAt = now;
        } catch {
          // Session state changes are surfaced by its normal disconnect handler.
        }
      }
    }

    _togglePause(visible) {
      const wasPaused = this.paused;
      this.paused = !!visible && this.active;
      if (this.paused && !wasPaused) this._flushNeutralInput();
      else this.keys.clear();
      const title = this.document?.getElementById('pauseTitle');
      if (title) title.textContent = this.paused ? 'PARTY PAUSED' : 'PAUSED';
      this.document?.getElementById('pauseMain')?.classList.toggle('hidden', this.paused);
      this.document?.getElementById('pauseLeaveServer')?.classList.toggle('hidden', !this.paused);
      if (this.paused) this.neo.pauseGame?.();
      else this.neo.resumeGame?.();
      this._renderPauseState();
    }

    togglePause(visible = !this.paused) {
      const wantsPaused = visible === true;
      if (this.active && typeof this.session.requestPause === 'function' && this._sessionStatus() === 'running') {
        const votes = Array.isArray(this.pauseState?.votes) ? this.pauseState.votes : [];
        const target = wantsPaused ? 'pause' : 'resume';
        if (this.pauseState?.pauseMode === 'vote'
          && this.pauseState.target === target
          && votes.includes(this._sessionPlayerId())) return false;
        if (wantsPaused) this._flushNeutralInput();
        try {
          this.session.requestPause(wantsPaused);
          return true;
        } catch {
          return false;
        }
      }
      this._togglePause(wantsPaused);
      return true;
    }

    _syncPauseState(pauseState, lobbyState = this.latestLobbyState) {
      const source = pauseState && typeof pauseState === 'object' ? pauseState : null;
      const pauseMode = source?.pauseMode === 'vote' || lobbyState?.pauseMode === 'vote' ? 'vote' : 'shared';
      if (!source) {
        this.pauseState = { ...this.pauseState, pauseMode };
        this._renderPauseState();
        return;
      }
      this.pauseState = {
        pauseMode,
        paused: source.paused === true,
        target: ['pause', 'resume'].includes(source.target) ? source.target : null,
        votes: Array.isArray(source.votes) ? source.votes.map(String).slice(0, 4) : [],
        requiredVotes: Math.max(1, Math.min(4, Math.trunc(Number(source.requiredVotes) || 1))),
      };
      this.authorityPaused = this.pauseState.paused;
      if (this.paused !== this.authorityPaused) this._togglePause(this.authorityPaused);
      else this._renderPauseState();
    }

    _renderPauseState() {
      const state = this.pauseState || {};
      const votes = Array.isArray(state.votes) ? state.votes : [];
      const required = Math.max(1, Number(state.requiredVotes) || 1);
      const voted = votes.includes(this._sessionPlayerId());
      const pauseVotePending = state.pauseMode === 'vote' && state.target === 'pause' && !state.paused;
      const votePanel = this.document?.getElementById('multiplayerPauseVote');
      votePanel?.classList.toggle('hidden', !pauseVotePending);
      const voteLabel = this.document?.getElementById('multiplayerPauseVoteLabel');
      const voteCount = this.document?.getElementById('multiplayerPauseVoteCount');
      const voteHint = this.document?.getElementById('multiplayerPauseVoteHint');
      if (voteLabel) voteLabel.textContent = 'PAUSE VOTE';
      if (voteCount) voteCount.textContent = `${votes.length} / ${required}`;
      if (voteHint) voteHint.textContent = voted ? 'Your vote is counted' : 'Press Esc to vote';

      const status = this.document?.getElementById('multiplayerPauseStatus');
      status?.classList.toggle('hidden', !this.paused);
      if (status && this.paused) {
        status.textContent = state.pauseMode === 'vote'
          ? state.target === 'resume'
            ? `RESUME VOTE • ${votes.length} / ${required}${voted ? ' • YOUR VOTE IS COUNTED' : ''}`
            : 'VOTE PAUSE • A MAJORITY MUST RESUME THE PARTY'
          : 'SHARED PAUSE • ANY PLAYER CAN RESUME THE PARTY';
      }
      const resume = this.document?.getElementById('pauseResume');
      if (resume && this.active) {
        resume.textContent = state.pauseMode === 'vote'
          ? voted && state.target === 'resume' ? 'RESUME VOTE ✓' : 'VOTE TO RESUME'
          : 'RESUME PARTY';
        resume.disabled = state.pauseMode === 'vote' && state.target === 'resume' && voted;
      } else if (resume) {
        resume.textContent = 'RESUME';
        resume.disabled = false;
      }
    }

    _isInputBlocked() {
      return this.inputSuspended
        || this.document?.hidden === true
        || this.document?.visibilityState === 'hidden'
        || this.paused
        || this._isChatOpen()
        || (!!this.neo.gameState && this.neo.gameState !== 'play')
        || !!this.neo.isOverlayBlockingInput?.()
        || !!this.neo.uiController?.isDialogueOpen?.();
    }

    _advanceLocalPrediction(now) {
      if (!this.localPredictedPlayer) return;
      const frameAt = Number(now || 0);
      if (!this.lastLocalPredictionAt) {
        this.lastLocalPredictionAt = frameAt;
        return;
      }
      const elapsedMs = Math.min(
        MAX_LOCAL_PREDICTION_CATCH_UP_MS,
        Math.max(0, frameAt - this.lastLocalPredictionAt),
      );
      this.lastLocalPredictionAt = frameAt;
      this.localPredictionAccumulatorMs += elapsedMs;
      while (this.localPredictionAccumulatorMs >= INPUT_INTERVAL_MS) {
        const preStepTick = Math.max(
          Number(this.currentSample?.tick || 0),
          Number(this.localPredictionTick || 0),
        );
        const postStepTick = preStepTick + 1;
        const input = { ...this.lastLocalPredictionInput };
        this.localPredictedPlayer = predictPosition(
          this.localPredictedPlayer,
          input,
          INPUT_INTERVAL_MS / 1000,
          this.currentSample?.state?.floorState,
          preStepTick,
        );
        this.localPredictionTick = postStepTick;
        this.pendingInputHistory.push({
          sequence: this.lastMovementInputSequence,
          predictionTick: postStepTick,
          input,
        });
        if (this.pendingInputHistory.length > 96) {
          this.pendingInputHistory.splice(0, this.pendingInputHistory.length - 96);
        }
        this.localPredictionAccumulatorMs -= INPUT_INTERVAL_MS;
      }
    }

    _renderedPlayers(now) {
      if (!this.currentSample) return {};
      const currentPlayers = this.currentSample.state.players || {};
      const previousPlayers = this.previousSample?.state?.players || currentPlayers;
      const previousReceivedAt = Number(this.previousSample?.receivedAt ?? this.currentSample.receivedAt);
      const duration = Math.max(1, this.currentSample.receivedAt - previousReceivedAt);
      const targetTime = now - INTERPOLATION_DELAY_MS;
      const alpha = (targetTime - previousReceivedAt) / duration;
      const extrapolationSeconds = Math.min(
        MAX_REMOTE_EXTRAPOLATION_MS,
        Math.max(0, targetTime - this.currentSample.receivedAt),
      ) / 1000;
      const players = interpolatePlayers(previousPlayers, currentPlayers, alpha, { extrapolationSeconds });
      const localPlayerId = this._sessionPlayerId();
      if (localPlayerId && this.localPredictedPlayer) {
        // Commit authority-sized prediction slices, then render a non-mutating
        // fractional preview so the shared campaign draw remains frame-smooth.
        this._advanceLocalPrediction(now);
        const local = this._localPredictionPreview();
        if (this.reconciliationOffset) {
          const elapsed = Math.max(0, now - this.reconciliationOffset.startedAt);
          const remaining = clamp(1 - elapsed / this.reconciliationOffset.durationMs, 0, 1);
          local.x += this.reconciliationOffset.x * remaining;
          local.y += this.reconciliationOffset.y * remaining;
          if (remaining <= 0) this.reconciliationOffset = null;
        }
        if (this.pendingBeamPresentation && now >= this.pendingBeamPresentation.untilAt) this.pendingBeamPresentation = null;
        // The release latch only suppresses the *predicted* beam after the
        // button comes up. It must never blank an authoritative beamChannel:
        // enemy-applied channels and beam struggles arrive that way, and the
        // latch stays set for as long as the beam button is idle.
        if (!local.beamChannel && this.pendingBeamPresentation && !this.localBeamReleaseRequested) {
          const remainingTicks = Math.max(1, Math.ceil((this.pendingBeamPresentation.untilAt - now) / INPUT_INTERVAL_MS));
          local.beamChannel = {
            moveKey: this.pendingBeamPresentation.moveKey,
            angle: this.pendingBeamPresentation.angle,
            startTick: Number(this.currentSample?.state?.tick || 0),
            untilTick: Number(this.currentSample?.state?.tick || 0) + remainingTicks,
            sweepDirection: 1,
          };
        }
        players[localPlayerId] = local;
      }
      return players;
    }

    _renderedEntities(kind, now) {
      if (!this.currentSample) return {};
      const current = this.currentSample.state[kind] || {};
      const previous = this.previousSample?.state?.[kind] || current;
      const previousReceivedAt = Number(this.previousSample?.receivedAt ?? this.currentSample.receivedAt);
      const duration = Math.max(1, this.currentSample.receivedAt - previousReceivedAt);
      const targetTime = now - INTERPOLATION_DELAY_MS;
      const alpha = (targetTime - previousReceivedAt) / duration;
      const extrapolationSeconds = Math.min(
        MAX_REMOTE_EXTRAPOLATION_MS,
        Math.max(0, targetTime - this.currentSample.receivedAt),
      ) / 1000;
      return interpolatePlayers(previous, current, alpha, { extrapolationSeconds });
    }

    _visibleCanvasBounds() {
      // Render the same logical 960×640 scene for every peer. CSS may crop the
      // overscan differently at different aspect ratios, but must never change
      // the world transform (or two clients can appear to have different maps).
      return {
        left: 0,
        top: 0,
        right: this.canvas.width,
        bottom: this.canvas.height,
      };
    }

    getPresentationPlayerSlots() {
      return this.presentationPlayerSlots;
    }

    _clearPresentationEntityCaches() {
      this.presentationEnemyActors.clear();
      this.presentationProjectiles.clear();
      this.presentationPickups.clear();
      this.presentationHazards.clear();
      this.presentationBodies.clear();
      this.presentationInteractables.clear();
      this.presentationSpecialChoiceKey = '';
      this.presentationSpecialChoiceAnchors = [];
    }

    _stablePresentationEntities(cache, sources, adapt = source => source) {
      const liveIds = new Set(sources.map(source => String(source.id)));
      cache.forEach((entity, id) => {
        if (!liveIds.has(id)) cache.delete(id);
      });
      return sources.map(source => {
        const id = String(source.id);
        const entity = cache.get(id) || {};
        Object.assign(entity, adapt(source));
        cache.set(id, entity);
        return entity;
      });
    }

    _specialRoomPresentationPickups(floorState) {
      const room = this.neo.currentRoom;
      const prepareSpecialRoom = this.neo.prepareSpecialRoom;
      const key = room && typeof prepareSpecialRoom === 'function'
        ? `${this.neo.floor}:${room.id}:${room.type}:${room.serviceUsed ? 'used' : 'available'}`
        : '';
      if (key === this.presentationSpecialChoiceKey) return this.presentationSpecialChoiceAnchors;

      this.presentationSpecialChoiceKey = key;
      this.presentationSpecialChoiceAnchors = [];
      if (!key) return this.presentationSpecialChoiceAnchors;

      // These are campaign presentation anchors, not authority pickups. Rebuild
      // them only when entering a room or when its consumed state changes.
      room.pickups = (Array.isArray(room.pickups) ? room.pickups : [])
        .filter(pickup => !['specialService', 'specialChoice'].includes(pickup?.type));
      if (!prepareSpecialRoom.call(this.neo, room)) return this.presentationSpecialChoiceAnchors;

      this.presentationSpecialChoiceAnchors = room.pickups
        .filter(pickup => pickup?.type === 'specialChoice')
        .map(pickup => ({
          ...pickup,
          id: `specialChoice:${this.neo.floor}:${room.id}:${pickup.choiceId}`,
          roomId: floorState.currentRoomId,
        }));
      return this.presentationSpecialChoiceAnchors;
    }

    // Recover vx/vy from how far the interpolated position moved since the last
    // presentation frame. `actor` still holds the previous frame's x/y; `player`
    // carries the new one. Returns the fields to merge onto the actor.
    _deriveActorVelocity(actor, player, frameDelta) {
      const x = Number(player.x || 0);
      const y = Number(player.y || 0);
      const hadPrevious = Number.isFinite(actor.x) && Number.isFinite(actor.y);
      if (!hadPrevious || !(frameDelta > 0)) return { vx: Number(actor.vx || 0), vy: Number(actor.vy || 0) };
      // A room change or respawn teleports the actor; a jump that large is not
      // movement and would spike the animation into a full sprint for a frame.
      const jumpedX = x - actor.x;
      const jumpedY = y - actor.y;
      if (Math.hypot(jumpedX, jumpedY) > 240) return { vx: 0, vy: 0 };
      const k = 1 - Math.exp(-NETWORK_VELOCITY_SMOOTH_HZ * frameDelta);
      return {
        vx: Number(actor.vx || 0) + (jumpedX / frameDelta - Number(actor.vx || 0)) * k,
        vy: Number(actor.vy || 0) + (jumpedY / frameDelta - Number(actor.vy || 0)) * k,
      };
    }

    _advancePresentationClock(authorityElapsedSeconds, frameDelta) {
      const authorityClock = Math.max(0, Number(authorityElapsedSeconds) || 0);
      if (!Number.isFinite(this.presentationElapsedSeconds)) {
        this.presentationElapsedSeconds = authorityClock;
      } else {
        this.presentationElapsedSeconds = Math.max(
          authorityClock,
          this.presentationElapsedSeconds + Math.max(0, Number(frameDelta) || 0),
        );
      }
      this.neo.gameElapsedTime = this.presentationElapsedSeconds;
      return this.presentationElapsedSeconds;
    }

    _syncCampaignPresentationEntities(players, projectiles, localPlayerId, state, frameDelta = 0, visibleRoomId = null) {
      const serverTick = Number(state?.tick || 0);
      const now = root.performance?.now?.() || Date.now();
      const livePlayerIds = new Set(Object.keys(players || {}));
      this.presentationPlayerActors.forEach((actor, playerId) => {
        if (!livePlayerIds.has(playerId)) this.presentationPlayerActors.delete(playerId);
      });
      const projectedPlayerSlots = Object.values(players || {}).map(player => {
        const authoritativeMeleeEvent = this.combatEffects.find(effect => (
          effect.data?.playerId === player.id
          && ['PLAYER_ATTACKED', 'PLAYER_ATTACK_FOLLOWUP'].includes(effect.eventType)
          && now - Number(effect.startedAt || 0) <= 220
        ));
        // Ability and dash events have their own presentation. Routing every
        // ability through the shared melee swing made a dash look like an M1.
        const attacking = !!authoritativeMeleeEvent
          || (player.action === 'attack' && serverTick - Number(player.actionTick || 0) <= 4);
        const activeSeconds = Number(this.neo.ATTACKS?.melee?.active || 0.17);
        const elapsed = Math.max(0, serverTick - Number(player.actionTick || 0)) / 20;
        const actor = this.presentationPlayerActors.get(player.id) || {};
        const presentationClock = Number(this.neo.gameElapsedTime || 0);
        const meleeActionKey = authoritativeMeleeEvent?.eventId
          || (attacking ? `${Number(player.actionTick || 0)}:${player.actionKind || player.actionMode || 'attack'}` : '');
        if (attacking && actor._networkMeleeActionKey !== meleeActionKey) {
          const observedAge = authoritativeMeleeEvent
            ? Math.max(0, now - Number(authoritativeMeleeEvent.startedAt || now)) / 1000
            : elapsed;
          actor._networkMeleeActionKey = meleeActionKey;
          actor._networkMeleeStartedAt = presentationClock - Math.min(activeSeconds, observedAge);
        }
        const swingRemaining = attacking && Number.isFinite(actor._networkMeleeStartedAt)
          ? Math.max(0, activeSeconds - (presentationClock - actor._networkMeleeStartedAt))
          : 0;
        const spriteAction = player.action === 'attack' && player.actionKind === 'antony_bite'
          ? 'bite'
          : player.action === 'dash'
          ? 'dash'
          : player.action === 'ability'
            ? (player.actionMode === 'laser' ? 'beam' : player.actionMode)
            : null;
        const spriteActionDuration = spriteAction === 'bite'
          ? 0.8
          : player.characterKey === 'sarge' && player.actionKind === 'hammer_smash'
            ? 0.3
            : 0.6;
        const spriteActionKey = spriteAction
          ? `${Number(player.actionTick || 0)}:${spriteAction}:${player.actionKind || ''}`
          : '';
        if (spriteAction && actor._networkSpriteActionKey !== spriteActionKey) {
          actor._networkSpriteActionKey = spriteActionKey;
          actor._networkSpriteActionStartedAt = presentationClock - Math.min(spriteActionDuration, elapsed);
        }
        // Read the previous position before Object.assign overwrites it.
        const derived = this._deriveActorVelocity(actor, player, frameDelta);
        Object.assign(actor, {
          ...player,
          ...derived,
          character: player.characterKey || 'thorn_knight',
          r: Number(player.radius || CAMPAIGN_PLAYER_RADIUS),
          hp: Number(player.hp || 0),
          maxHp: Number(player.maxHp || 100),
          coins: Number(player.coins || 0),
          items: { ...(player.items || {}) },
          equipmentSlots: Array.isArray(player.equipmentSlots) ? [...player.equipmentSlots] : [],
          level: Math.max(1, Number(player.level || 1)),
          xp: Math.max(0, Number(player.xp || 0)),
          xpToNext: Math.max(1, Number(player.xpToNext || 20)),
          weaponCooldown: Math.max(0, Number(player.attackCooldownUntilTick || 0) - serverTick) / 20,
          // Lazer Glasses is an equipped-weapon channel. Project the authority
          // channel into the same campaign renderer fields used by combat.js,
          // so it never needs a multiplayer-only beam drawing path.
          weaponBeamTime: Math.max(0, Number(player.weaponBeamChannel?.untilTick || 0) - serverTick) / 20,
          weaponBeamTick: Math.max(0, Number(player.weaponBeamChannel?.nextTick || serverTick) - serverTick) / 20,
          stun: Math.max(0, Number(player.stunnedUntilTick || 0) - serverTick) / 20,
          inv: serverTick < Number(player.invulnerableUntilTick || 0) ? 1 : 0,
          swing: swingRemaining,
          swingA: Number(player.aimDirection || 0),
          swingFacing: Math.cos(Number(player.aimDirection || 0)) < 0 ? -1 : 1,
          ...(spriteAction && ['beam', 'smash', 'dash', 'bite'].includes(spriteAction) ? {
            spriteAction,
            spriteActionStartedAt: actor._networkSpriteActionStartedAt,
            spriteActionUntil: actor._networkSpriteActionStartedAt + spriteActionDuration,
          } : {}),
          // Arm recoil is drawn by the shared drawPlayer path, but it reads a
          // countdown (armRecoilUntil vs gameElapsedTime) that combat.js sets
          // locally on fire. Nothing writes it here, so network heroes shot with
          // stiff arms. Derive the same countdown from the authority's action
          // tick so the shared renderer animates it exactly as in single player.
          ...(attacking ? {
            armRecoilUntil: actor._networkMeleeStartedAt + ARM_RECOIL_DURATION,
            armRecoilDuration: ARM_RECOIL_DURATION,
            armRecoilA: Number(player.aimDirection || 0),
            armRecoilFacing: Math.cos(Number(player.aimDirection || 0)) < 0 ? -1 : 1,
          } : {}),
          // Status rings, dash squash and flight are drawn by the shared
          // drawPlayer/drawPlayerSlot path for every hero, but these render
          // fields used to be derived only for the local player further down in
          // _syncCampaignHudState. Teammates therefore never showed that they
          // were burning, poisoned or dashing. Derive them per actor instead, so
          // the same authority tick counters animate everyone identically.
          statuses: player.statuses || root.NeoNyke?.simulation?.createCampaignStatusMap?.() || {},
          // The authority tracks the all-relics god window per player as
          // godUntilTick, but nothing projected it, so the golden tint never
          // appeared in a network run -- for teammates OR for you.
          godTimer: Math.max(0, Number(player.godUntilTick || 0) - serverTick) / 20,
          dashTime: player.action === 'dash' && serverTick - Number(player.actionTick || 0) <= 4 ? 0.2 : 0,
          cowardsWayTime: Math.max(0, Number(player.statusUntilTick?.cowards_way || 0) - serverTick) / 20,
          princessFlightTime: Math.max(0, Number(player.statusUntilTick?.flying_unhitable || 0) - serverTick) / 20,
          mooggyZoomiesTime: Math.max(0, Number(player.statusUntilTick?.mooggy_zoomies || 0) - serverTick) / 20,
          overhealBarrier: Number(player.barrier || 0),
          overhealBarrierMax: Math.max(Number(player.barrier || 0), Number(player.maxHp || 100) * 0.4),
          networkDowned: !!player.downed,
        });
        this.presentationPlayerActors.set(player.id, actor);
        return {
          id: player.id,
          // The local hero renders through the full campaign drawPlayer path
          // (no tint, no name label), exactly like a single-player run.
          isLocal: player.id === localPlayerId,
          label: `${player.displayName || player.id}${player.id === localPlayerId ? ' (YOU)' : ''}`,
          color: player.color || derivePlayerColor(player),
          getEntity: () => actor,
          getCharacter: () => player.characterKey || 'thorn_knight',
          getDead: () => !!player.downed,
        };
      });
      this.presentationPlayerSlots = projectedPlayerSlots.filter(slot => (
        !visibleRoomId || slot.getEntity?.()?.roomId === visibleRoomId
      ));
      const localSlot = projectedPlayerSlots.find(slot => slot.id === localPlayerId);
      const viewpointId = this._viewpointPlayerId(state, localPlayerId);
      const viewpointSlot = projectedPlayerSlots.find(slot => slot.id === viewpointId) || localSlot;
      this.neo.presentationPlayerSlots = this.presentationPlayerSlots;
      // The world renderer only needs heroes in the viewpoint room, but the
      // minimap needs every connected hero so teammates remain locatable after
      // moving through a door.
      this.neo.multiplayerMapPlayerSlots = projectedPlayerSlots.filter(slot => !players?.[slot.id]?.disconnected);
      this.neo.presentationViewpointPlayer = viewpointSlot?.getEntity?.() || null;
      if (localSlot) {
        this.neo.player = localSlot.getEntity();
        this._syncCampaignHudState(this.neo.player, state);
      }
      this.neo.activePlayerEffects = this._projectActivePlayerEffects(now);
      const authoritativeProjectiles = this._stablePresentationEntities(
        this.presentationProjectiles,
        Object.values(projectiles || {}),
        projectile => ({
          ...projectile,
          r: Number(projectile.radius || 7),
          enemy: !!projectile.hostile,
          life: Math.max(0, Number(projectile.expiresTick || 0) - serverTick) / 20,
        }),
      );
      this.neo.projectiles = [...authoritativeProjectiles, ...this._projectPredictedProjectiles(now)];
      this._syncSpecialMovePresentation(now);
    }

    // The shared campaign renderer already has the charge meters and previews
    // for these moves. In multiplayer their state lives on the authority-owned
    // heldCharge instead of the local combat loop, so project it onto the same
    // presentation fields every frame. This is deliberately local-player only:
    // a remote hero's wind-up is gameplay state, but their HUD-style meter must
    // never overwrite the one above the player we are rendering as ourselves.
    _syncHeldChargePresentation(localPlayer, state, now) {
      const neo = this.neo;
      neo.healingZoneCharging = false;
      neo.deathBallCharging = false;
      neo.deathBallPowerUp = false;
      neo.nimrodStompCharging = false;
      neo.loveBombCharging = false;
      neo.ghostBallCharging = false;
      neo.healingZoneChargeTime = 0;
      neo.deathBallChargeTime = 0;
      neo.nimrodStompChargeTime = 0;
      neo.loveBombChargeTime = 0;
      neo.ghostBallChargeTime = 0;

      const authoritativeHeld = localPlayer?.heldCharge;
      const held = authoritativeHeld || this.pendingHeldCharge;
      if (!held) return;
      const maxTicks = Math.max(1, Number(held.maxChargeTicks || 1));
      const snapshotTick = Number(state?.tick || 0);
      // Snapshots arrive at 20 Hz. Advance only the meter cosmetically between
      // them so it fills continuously without making the client authoritative.
      const receivedAt = Number(this.currentSample?.receivedAt || now);
      const estimatedTick = snapshotTick + Math.max(0, Number(now || 0) - receivedAt) / INPUT_INTERVAL_MS;
      const ratio = authoritativeHeld
        ? clamp((estimatedTick - Number(held.startTick || snapshotTick)) / maxTicks, 0, 1)
        : clamp((Number(now || 0) - Number(held.startAt || now)) / (maxTicks * INPUT_INTERVAL_MS), 0, 1);
      const setCharge = (chargingKey, timeKey, maxSeconds) => {
        neo[chargingKey] = true;
        neo[timeKey] = ratio * Math.max(0.001, Number(maxSeconds || 5));
      };

      switch (held.moveKey) {
        case 'healing_zone':
          setCharge('healingZoneCharging', 'healingZoneChargeTime', neo.HEALING_ZONE_MAX_CHARGE || 5);
          break;
        case 'death_ball':
          setCharge('deathBallCharging', 'deathBallChargeTime', neo.DEATH_BALL_MAX_CHARGE || 5);
          break;
        case 'turtle_powerup':
          setCharge('deathBallCharging', 'deathBallChargeTime', neo.DEATH_BALL_MAX_CHARGE || 5);
          neo.deathBallPowerUp = true;
          break;
        case 'nimrod_stomp':
          setCharge('nimrodStompCharging', 'nimrodStompChargeTime', neo.NIMROD_STOMP_MAX_CHARGE || 5);
          break;
        case 'love_bomb_laser':
          setCharge('loveBombCharging', 'loveBombChargeTime', neo.LOVE_BOMB_MAX_CHARGE || 5);
          break;
        case 'ghost_ball':
          setCharge('ghostBallCharging', 'ghostBallChargeTime', neo.GHOST_BALL_MAX_CHARGE || 5);
          break;
        default:
          break;
      }
    }

    // Steer the local hero's beam against the live cursor every frame with the
    // same shared rule the authority applies to our streamed aim. The server
    // stays authoritative for damage; this only removes the network hop from
    // what the caster sees.
    _updateLocalBeamAngle(localPlayer, frameDelta) {
      const channel = localPlayer?.beamChannel;
      if (!channel) {
        this.localBeamAngle = null;
        this.localBeamChannelStart = -1;
        return;
      }
      if (this.localBeamChannelStart !== Number(channel.startTick)) {
        this.localBeamAngle = Number(channel.angle || 0);
        this.localBeamChannelStart = Number(channel.startTick);
      }
      this.localBeamAngle = moveContent.steerBeamChannelAngle?.(
        channel.moveKey,
        this.localBeamAngle,
        this.aimDirection,
        frameDelta,
        { sweepDirection: channel.sweepDirection, laserWeightMultiplier: localPlayer.itemStats?.laserWeightMultiplier },
      ) ?? Number(channel.angle || 0);
    }

    _projectActivePlayerEffects() {
      const localPlayerId = this._sessionPlayerId();
      const serverTick = Number(this.currentSample?.state?.tick || 0);
      return this.presentationPlayerSlots.flatMap(slot => {
        const actor = slot.getEntity?.();
        const channel = actor?.beamChannel;
        if (!channel || slot.getDead?.()) return [];
        const isLocal = slot.id === localPlayerId;
        return [{
          player: actor,
          abilityId: channel.moveKey,
          equippedLaser: channel.moveKey,
          laserActive: true,
          laserTime: Math.max(0.05, (Number(channel.untilTick || 0) - serverTick) / 20),
          laserTick: 0,
          laserMode: beamChannelLaserMode(channel.moveKey),
          laserAngle: isLocal && this.localBeamAngle != null ? this.localBeamAngle : Number(channel.angle || 0),
          laserSweepSpeed: Number(channel.sweepDirection || 1) * 4.6,
          loveBeamCasting: channel.moveKey === 'love_beam',
          activeBeamPaths: null,
        }];
      });
    }

    _syncSpecialMovePresentation(now = root.performance?.now?.() || Date.now()) {
      const slotsById = new Map(this.presentationPlayerSlots.map(slot => [slot.id, slot]));
      const abilityEffects = this.combatEffects.filter(effect => effect.eventType === 'PLAYER_ABILITY_USED');
      const liveJusticeBlades = Object.values(this.currentSample?.state?.abilityEntities || {})
        .filter(entity => entity?.kind === 'blade_justice');
      const liveExcaliburSwords = Object.values(this.currentSample?.state?.abilityEntities || {})
        .filter(entity => entity?.kind === 'excalibur_strike');
      this.neo.justiceBlades = [];
      this.neo.titanHammer = null;
      this.neo.skySwords = [];

      abilityEffects.forEach(effect => {
        const data = effect.data || {};
        const actor = slotsById.get(data.playerId)?.getEntity?.();
        if (!actor) return;
        const age = Math.max(0, now - Number(effect.startedAt || now)) / 1000;
        const aim = Number(data.aimDirection || actor.aimDirection || 0);
        if (data.abilityId === 'blade_justice' && age < 2.1 && !liveJusticeBlades.some(blade => blade.ownerId === actor.id)) {
          for (let index = 0; index < 3; index += 1) {
            const fanOffset = (index - 1) * 0.5;
            const swingPhase = age * 7.5 + index * 0.7;
            const direction = aim + fanOffset + Math.sin(swingPhase) * 0.7;
            const orbit = 120 * (0.82 + 0.18 * Math.cos(swingPhase));
            this.neo.justiceBlades.push({
              id: `${effect.eventId || 'blade'}:${index}`,
              ownerId: actor.id,
              x: actor.x + Math.cos(direction) * orbit,
              y: actor.y + Math.sin(direction) * orbit,
              angle: direction + Math.sign(Math.cos(swingPhase)) * 0.5,
              radius: 16,
              life: 2.1 - age,
              maxLife: 2.1,
            });
          }
        } else if (data.abilityId === 'titan_hammer' && age < 8) {
          this.neo.titanHammer = {
            id: effect.eventId || 'titan-hammer',
            ownerId: actor.id,
            x: actor.x + Math.cos(aim) * 120,
            y: actor.y + Math.sin(aim) * 120,
            angle: aim,
            life: 8 - age,
            radius: Math.max(70, Number(data.effectRadius || 120) * 0.75),
            swinging: age < 0.24 ? Math.max(0, 1 - age / 0.24) : 0,
            swingCooldown: 0,
            swingsLeft: 0,
          };
        } else if (data.abilityId === 'excalibur_strike' && age < 1.34 && !liveExcaliburSwords.some(sword => sword.ownerId === actor.id)) {
          const centerX = Number.isFinite(Number(data.originX)) ? Number(data.originX) : Number(actor.x);
          const centerY = Number.isFinite(Number(data.originY)) ? Number(data.originY) : Number(actor.y);
          const seed = stableNumericId(effect.eventId || `${data.playerId}:${effect.tick || 0}`);
          for (let index = 0; index < 5; index += 1) {
            const delay = index * 0.07;
            const localAge = age - delay;
            if (localAge >= 1.34) continue;
            const offsetAngle = ((seed + index * 2654435761) % 6283) / 1000;
            const offsetDistance = index === 0 ? 0 : 28 + ((seed >>> (index * 3)) % 92);
            const spin = ((seed >>> index) & 1 ? -1 : 1) * (5 + ((seed + index) % 30) / 10);
            const falling = localAge < 0.34;
            const hovering = localAge >= 0.34 && localAge < 1.04;
            this.neo.skySwords.push({
              id: `${effect.eventId || 'excalibur'}:${index}`,
              x: centerX + Math.cos(offsetAngle) * offsetDistance,
              y: centerY + Math.sin(offsetAngle) * offsetDistance,
              radius: 76,
              delay: Math.max(0, -localAge),
              phase: falling ? 'falling' : hovering ? 'hover' : 'fade',
              fall: falling ? Math.max(0, 0.34 - Math.max(0, localAge)) : 0,
              hoverTime: hovering ? 1.04 - localAge : 0,
              fadeT: hovering || falling ? 0.3 : Math.max(0, 1.34 - localAge),
              angle: offsetAngle + spin * Math.max(0, localAge - 0.34),
              spin,
            });
          }
        }
      });
      // Blade Justice has authoritative live transforms and contact state. The
      // cast event only remains as a short compatibility fallback before the
      // first snapshot arrives; never recreate a sword path from its cast aim.
      liveJusticeBlades.forEach(blade => {
        const owner = slotsById.get(blade.ownerId)?.getEntity?.();
        if (!owner) return;
        this.neo.justiceBlades.push({
          id: blade.id, ownerId: blade.ownerId,
          x: Number(blade.x), y: Number(blade.y), angle: Number(blade.angle || 0),
          radius: Number(blade.radius || 16),
          life: Math.max(0, Number(blade.expiresTick || 0) - Number(this.currentSample?.state?.tick || 0)) / 20,
          maxLife: Number(blade.justiceEffect?.durationSeconds || 2.1),
        });
      });
      // Excalibur's stagger, impact phase and spin are live authority state.
      // The cast event remains only as a fallback until its first snapshot.
      const serverTick = Number(this.currentSample?.state?.tick || 0);
      liveExcaliburSwords.forEach(sword => {
        const phase = sword.phase || (serverTick < Number(sword.impactTick || 0)
          ? 'falling'
          : serverTick < Number(sword.hoverUntilTick || 0) ? 'hover' : 'fade');
        this.neo.skySwords.push({
          id: sword.id,
          x: Number(sword.x), y: Number(sword.y), radius: Number(sword.radius || 76),
          delay: Math.max(0, Number(sword.delayUntilTick || 0) - serverTick) / 20,
          phase,
          fall: phase === 'falling' ? Math.max(0, Number(sword.impactTick || 0) - serverTick) / 20 : 0,
          hoverTime: phase === 'hover' ? Math.max(0, Number(sword.hoverUntilTick || 0) - serverTick) / 20 : 0,
          fadeT: phase === 'fade' ? Math.max(0, Number(sword.fadeUntilTick || sword.expiresTick || 0) - serverTick) / 20 : 0.3,
          angle: Number(sword.angle || 0), spin: Number(sword.spin || 0),
        });
      });
      // The cast event is only a compatibility fallback. A live Titan Hammer
      // is authoritative state, so its current transform and swing are never
      // guessed from the original cursor direction on the rendering client.
      const liveHammer = Object.values(this.currentSample?.state?.abilityEntities || {})
        .filter(entity => entity?.kind === 'titan_hammer')
        .sort((first, second) => Number(second.spawnTick || 0) - Number(first.spawnTick || 0))[0];
      if (liveHammer) {
        const owner = slotsById.get(liveHammer.ownerId)?.getEntity?.();
        if (owner) {
          this.neo.titanHammer = {
            id: liveHammer.id,
            ownerId: liveHammer.ownerId,
            x: Number(liveHammer.x), y: Number(liveHammer.y),
            angle: Number(liveHammer.angle || 0),
            life: Math.max(0, Number(liveHammer.expiresTick || 0) - Number(this.currentSample?.tick || 0)) / 20,
            radius: Number(liveHammer.radius || liveHammer.r || 32),
            swinging: Math.max(0, Number(liveHammer.swinging || 0)),
            swingCooldown: Math.max(0, Number(liveHammer.swingCooldownUntilTick || 0) - Number(this.currentSample?.tick || 0)) / 20,
            swingsLeft: Math.max(0, Number(liveHammer.swingsLeft || 0)),
          };
        }
      }
      this.neo.ghostBalls = this.neo.projectiles.filter(projectile => projectile.kind === 'ghost_ball');
      this.neo.projectiles = this.neo.projectiles.filter(projectile => projectile.kind !== 'ghost_ball');
    }

    _syncCampaignHudState(localPlayer, state) {
      const serverTick = Number(state?.tick || 0);
      const equippedMoves = localPlayer.equippedMoves || {};
      this.neo.cooldowns = this.neo.cooldowns || {};
      ['melee', 'laser', 'smash', 'dash'].forEach(slot => {
        const moveKey = equippedMoves[slot];
        const current = slot === 'melee'
          ? Math.max(0, Number(localPlayer.attackCooldownUntilTick || 0) - serverTick) / 20
          : Math.max(0, Number(localPlayer.moveCooldownUntilTick?.[moveKey] || 0) - serverTick) / 20;
        // Multi-charge moves (Thorn's 2-charge dash, Warp's 4, …) carry a real
        // charge pool on the authority. Read it through readMoveChargeState rather
        // than indexing moveChargeState directly: pools are created lazily on first
        // cast, so a direct lookup would miss on a never-used move and render it as
        // single-charge until the player fires it once — Thorn's dash visibly
        // growing from 1 pip to 2 mid-fight.
        const pool = slot === 'melee'
          ? localPlayer.equippedWeapon && combatSystem.readWeaponChargeState
            ? combatSystem.readWeaponChargeState(localPlayer, localPlayer.equippedWeapon)
            : moveKey && combatSystem.readMoveChargeState
              ? combatSystem.readMoveChargeState(localPlayer, moveKey)
              : null
          : !moveKey || !combatSystem.readMoveChargeState
            ? null
            : combatSystem.readMoveChargeState(localPlayer, moveKey);
        if (pool && pool.maxCharges > 0) {
          const timers = pool.timers
            .map(readyAt => Math.max(0, (Number(readyAt) - serverTick) / 20))
            .filter(seconds => seconds > 0)
            .sort((a, b) => a - b);
          this.neo.cooldowns[slot] = {
            charges: pool.charges,
            maxCharges: pool.maxCharges,
            timers,
            holding: 0,
          };
          return;
        }
        this.neo.cooldowns[slot] = {
          charges: current > 0 ? 0 : 1,
          maxCharges: 1,
          timers: current > 0 ? [current] : [],
          holding: 0,
        };
      });
      // dashTime/cowardsWayTime/princessFlightTime are derived per actor in
      // _syncCampaignPresentationEntities so remote heroes animate too.
      const channel = localPlayer.beamChannel;
      this.neo.laserActive = !!channel;
      this.neo.laserTime = channel ? Math.max(0, (Number(channel.untilTick || 0) - serverTick) / 20) : 0;
      this.neo.laserTick = 0;
      this.neo.laserMode = channel ? beamChannelLaserMode(channel.moveKey) : 'beam';
      this.neo.loveBeamCasting = channel?.moveKey === 'love_beam';
      this.neo.laserSweepSpeed = channel ? Number(channel.sweepDirection || 1) * 4.6 : 0;
      this.neo.laserAngle = channel
        ? (this.localBeamAngle ?? Number(channel.angle || 0))
        : Number(localPlayer.aimDirection || 0);
      this.neo.activeBeamPaths = null;
    }

    // This is intentionally a state projection, not a renderer. It gives the
    // existing browser game (`Neo.draw`) the same live objects it normally
    // reads in single player; networked mode changes only where those objects
    // came from.
    syncPresentation() {
      if (!this.active || !this.ctx || !this.canvas) return;
      const now = root.performance?.now?.() || Date.now();
      const state = this.currentSample?.state;
      const authorityFloorState = state?.floorState || CAMPAIGN_ROOM_GEOMETRY;
      const visibleBounds = this._visibleCanvasBounds();
      const players = this._renderedPlayers(now);
      const localPlayerId = this._sessionPlayerId();
      const viewpointPlayerId = this._viewpointPlayerId(state, localPlayerId);
      const viewpointPlayer = players[viewpointPlayerId] || players[localPlayerId];
      const visibleRoomId = viewpointPlayer?.roomId || authorityFloorState.currentRoomId;
      const floorState = { ...authorityFloorState, currentRoomId: visibleRoomId };
      const enemies = this._renderedEntities('enemies', now);
      const projectiles = this._renderedEntities('projectiles', now);
      const pickups = state?.pickups || {};
      const localPlayer = players[localPlayerId];
      const frameDelta = this.lastPresentationFrameAt > 0
        ? clamp((now - this.lastPresentationFrameAt) / 1000, 0, 0.05)
        : 1 / 60;
      if (this.lastPresentationFrameAt > 0) this._recordFrameInterval(now - this.lastPresentationFrameAt);
      this.lastPresentationFrameAt = now;
      this._advancePresentationClock(state?.elapsedSeconds, frameDelta);
      this._updateCamera(viewpointPlayer, frameDelta);
      // Neo.draw reads Neo.camera in every local presentation mode. Keep that
      // canonical camera object synchronized with the network state adapter;
      // otherwise the adapter aimed/tracked with one camera while the normal
      // renderer displayed another, making the same 900x700 room look larger.
      this.neo.camera = this.neo.camera || { x: 0, y: 0 };
      this.neo.camera.x = this.camera.x;
      this.neo.camera.y = this.camera.y;
      const transform = computeCameraTransform(this.canvas.width, this.canvas.height, this.camera, visibleBounds);
      this.lastWorldTransform = transform;
      this.lastRenderedPlayerCount = Object.values(players).filter(player => player.roomId === visibleRoomId).length;
      this.lastRenderedEnemyCount = Object.keys(enemies).length;
      this.lastRenderedProjectileCount = Object.keys(projectiles).length;
      this.lastRenderedPickupCount = Object.keys(pickups).length;
      const ctx = this.ctx;

      this._updateUpgradeDwell(localPlayer, state, frameDelta);
      this._updateLocalBeamAngle(localPlayer, frameDelta);
      this._syncAutomaticChestInteraction(localPlayer, state);
      this._syncNeoPresentationFloor(floorState, enemies, pickups, state);
      this._syncCampaignPresentationEntities(players, projectiles, localPlayerId, state, frameDelta, visibleRoomId);
      this._syncHeldChargePresentation(localPlayer, state, now);
      const authorityStruggle = state?.beamStruggles?.[localPlayerId];
      const struggleEnemy = authorityStruggle
        ? this.presentationEnemyActors.get(String(authorityStruggle.enemyId))
          || this.presentationEnemyActors.get(authorityStruggle.enemyId)
        : null;
      const opponentId = authorityStruggle?.opponentPlayerId === localPlayerId
        ? authorityStruggle.playerId : authorityStruggle?.opponentPlayerId;
      const struggleOpponent = opponentId ? this.presentationPlayerActors.get(opponentId) : null;
      const struggleTarget = struggleEnemy || struggleOpponent;
      const localIsPrimary = authorityStruggle?.playerId === localPlayerId;
      this.neo.beamStruggle = authorityStruggle && struggleTarget ? {
        active: true,
        enemy: struggleTarget,
        opponentPlayer: struggleOpponent,
        progress: localIsPrimary
          ? Number(authorityStruggle.progress || 0.5)
          : 1 - Number(authorityStruggle.progress || 0.5),
        mashCount: Number(authorityStruggle.mashCount || 0),
        elapsed: Math.max(0, Number(state.tick || 0) - Number(authorityStruggle.startTick || 0)) / 20,
        duration: Math.max(0, Number(authorityStruggle.endTick || 0) - Number(authorityStruggle.startTick || 0)) / 20,
        x: Number(authorityStruggle.x || 0),
        y: Number(authorityStruggle.y || 0),
      } : null;
      const floorTransitionAge = this.floorTransitionStartedAt > 0
        ? Math.max(0, now - this.floorTransitionStartedAt) / 1000
        : Number.POSITIVE_INFINITY;
      this.neo.showFloorTransition = floorTransitionAge <= 1.25;
      this.neo.floorTransitionTime = floorTransitionAge;
      this._updateHud(state, players);
      this._recordFrameDiagnostic((root.performance?.now?.() || Date.now()) - now);
      this._renderDiagnostics();
      return true;
    }

    // Compatibility alias for callers that previously treated this adapter as
    // a renderer. It now only synchronizes state; Neo.draw owns presentation.
    render() {
      return this.syncPresentation();
    }

    _updateCamera(player, fixedDelta) {
      if (!player) return;
      const changedRoom = this.camera.roomId !== player.roomId;
      const targetX = Number(player.x || 0) - this.canvas.width / 2 + Number(player.vx || 0) * 0.08;
      const targetY = Number(player.y || 0) - this.canvas.height / 2 + Number(player.vy || 0) * 0.08;
      if (changedRoom || !Number.isFinite(this.camera.x) || !Number.isFinite(this.camera.y)) {
        this.camera.x = targetX;
        this.camera.y = targetY;
        this.camera.roomId = player.roomId || null;
        return;
      }
      const smoothing = 1 - Math.exp(-8 * Math.max(0, Number(fixedDelta) || 0));
      this.camera.x += (targetX - this.camera.x) * smoothing;
      this.camera.y += (targetY - this.camera.y) * smoothing;
    }

    _syncNeoPresentationFloor(floorState, enemies, pickups, state) {
      const layoutRooms = floorState.layout?.rooms || [];
      const visited = new Set(floorState.visitedRoomIds || []);
      const previousRoomId = this.neo.currentRoom?.id || null;
      const previousFloorNumber = Math.max(0, Number(this.neo.floor || 0));
      const authorityRoomId = floorState.currentRoomId || null;
      const rooms = layoutRooms.map(source => {
        let room = this.presentationRooms.get(source.id);
        if (!room) {
          room = { id: source.id, enemies: [], projectiles: [], pickups: [], chests: [], decorations: [], structures: [], destructibles: [], hazards: [] };
          this.presentationRooms.set(source.id, room);
        }
        Object.assign(room, source, {
          explored: visited.has(source.id),
          cleared: floorState.encounters?.[source.id]?.status === 'cleared'
            || floorState.rewards?.[source.id]?.status === 'claimed',
          // Presentation rooms are reused between snapshots. Authority omits
          // inactive shop state, so normalize every transient field instead of
          // retaining stock from a previous snapshot on the reused object.
          shopOffers: Array.isArray(source.shopOffers) ? source.shopOffers : [],
          shopMoveOffers: Array.isArray(source.shopMoveOffers) ? source.shopMoveOffers : [],
          shopWeaponOffers: Array.isArray(source.shopWeaponOffers) ? source.shopWeaponOffers : [],
          shopAllyOffers: Array.isArray(source.shopAllyOffers) ? source.shopAllyOffers : [],
          shopHasAllies: !!source.shopHasAllies,
          shopTradeOffer: source.shopTradeOffer || null,
          shopStocked: !!source.shopStocked,
          endlessIntermission: !!source.endlessIntermission,
          bossRushIntermission: !!source.bossRushIntermission,
          serviceUsed: !!source.serviceUsed,
        });
        return room;
      });
      const activeIds = new Set(layoutRooms.map(room => room.id));
      Array.from(this.presentationRooms.keys()).forEach(id => {
        if (!activeIds.has(id)) this.presentationRooms.delete(id);
      });
      this.neo.rooms = rooms;
      this.neo.currentRoom = authorityRoomId == null
        ? null
        : rooms.find(room => room.id === authorityRoomId) || null;
      const authorityFloorNumber = Math.max(1, Number(floorState.layout?.floorNumber || 1));
      this.neo.floor = authorityFloorNumber;
      this.neo.floorsEntered = authorityFloorNumber;
      this.neo.endlessIntermission = !!this.neo.currentRoom?.endlessIntermission;
      this.neo.bossRushIntermission = !!this.neo.currentRoom?.bossRushIntermission;
      const intermissionShop = !!this.neo.currentRoom?.shopStocked
        && (this.neo.endlessIntermission || this.neo.bossRushIntermission);
      const shopActive = this.neo.currentRoom?.type === 'shop' || intermissionShop;
      this.neo.shopOffers = shopActive ? this.neo.currentRoom.shopOffers : [];
      const roomChanged = previousRoomId != null
        && (previousRoomId !== authorityRoomId
          || (previousFloorNumber > 0 && previousFloorNumber !== authorityFloorNumber));
      const shopPanelOpen = !!this.neo.isPanelOpen?.(this.neo.ui?.shopPanel);
      if ((roomChanged || !shopActive) && shopPanelOpen) {
        this.neo.setShopPanelOpen?.(false, { animateClose: false });
      } else if (shopActive && shopPanelOpen) {
        this.neo.markShopPanelDirty?.();
        this.neo.renderShopPanel?.();
      }
      const liveEnemies = Object.values(enemies || {})
        .filter(enemy => !enemy.dead && enemy.roomId === floorState.currentRoomId);
      this.neo.enemies = this._stablePresentationEntities(
        this.presentationEnemyActors,
        liveEnemies,
        enemy => {
          const currentTick = Number(state?.tick || 0);
          const lostSightActive = currentTick < Number(enemy.confusedBlindUntilTick || 0);
          if (lostSightActive && !this.enemyLostSightStartedAtTick.has(enemy.id)) {
            this.enemyLostSightStartedAtTick.set(enemy.id, currentTick);
          } else if (!lostSightActive) {
            this.enemyLostSightStartedAtTick.delete(enemy.id);
          }
          const adapted = {
            ...enemy,
            r: Number(enemy.radius || 20),
            // Prefer the compact dynamic state when present. A full bootstrap
            // has health/maxHealth, while later multiplayer frames update
            // hp/maxHp; this is the exact hp/max pair the shared 2D and 3D
            // enemy renderers consume.
            hp: Number(enemy.hp ?? enemy.health ?? 0),
            max: Math.max(1, Number(enemy.maxHp ?? enemy.maxHealth ?? enemy.max ?? 1)),
            speed: Number(enemy.moveSpeed || 0),
            spawnT: Math.max(0, 0.72 - (Number(state?.tick || 0) - Number(enemy.spawnTick || 0)) / 20),
            stun: Math.max(0, Number(enemy.stunnedUntilTick || 0) - Number(state?.tick || 0)) / 20,
            confusedBlindUntil: Number(enemy.confusedBlindUntilTick || 0) / 20,
            playerLostSight: lostSightActive,
            playerLostSightAge: lostSightActive
              ? Math.max(0, currentTick - Number(this.enemyLostSightStartedAtTick.get(enemy.id) || currentTick)) / 20
              : 0,
            // Status state is already canonical authority state. Pass it through
            // unchanged so campaign 2D/3D renderers see the same stacks,
            // durations and proc power as local play; never reconstruct a
            // network-only approximation from legacy bleed/fire fields.
            statuses: enemy.statuses || root.NeoNyke?.simulation?.createCampaignStatusMap?.() || {},
            // Authored-behavior enemies carry the campaign's real telegraph
            // timers (windup/swingTime/beamTime/dashTime); pass those through
            // so the normal renderer draws the exact same wind-ups and beams.
            // Only the generic legacy types reconstruct them from `state`.
            swingTime: Number.isFinite(Number(enemy.swingTime)) && Number(enemy.swingTime) > 0
              ? Number(enemy.swingTime)
              : (enemy.state === 'attacking' ? 0.2 : 0),
            windup: Number.isFinite(Number(enemy.windup)) && Number(enemy.windup) > 0
              ? Number(enemy.windup)
              : (enemy.state === 'aiming' ? 0.35 : 0),
            beamAngle: Number(enemy.beamAngle ?? enemy.aimDirection ?? 0),
          };
          this.neo.ensureStatuses?.(adapted);
          return adapted;
        },
      );
      this.neo.allies = Object.fromEntries(Object.values(state?.allies || {})
        .filter(ally => ally && ally.roomId === floorState.currentRoomId && ally.status !== 'dead')
        .map(ally => [ally.id, {
          ...ally,
          r: Number(ally.radius || ally.r || 13),
          hp: Number(ally.health ?? ally.hp ?? 0),
          max: Math.max(1, Number(ally.maxHealth ?? ally.max ?? 1)),
        }]));
      // A dead authority enemy is a *source* for one campaign corpse, not a
      // static render proxy. Reapplying its frozen death position and age on
      // every snapshot used to cancel updateDeadBodies() before it could launch
      // or tumble, leaving the live sprite visibly sitting in place.
      const deadEnemies = Object.values(enemies || {})
        .filter(enemy => enemy.dead && enemy.roomId === floorState.currentRoomId);
      const liveBodyIds = new Set(deadEnemies.map(enemy => String(enemy.id)));
      this.presentationBodies.forEach((_body, id) => {
        if (!liveBodyIds.has(id)) this.presentationBodies.delete(id);
      });
      this.neo.deadBodies = deadEnemies.map(enemy => {
        const id = String(enemy.id);
        let body = this.presentationBodies.get(id);
        const authorityAge = Math.max(0, Number(state?.tick || 0) - Number(enemy.deathTick || state?.tick || 0)) / 20;
        if (!body) {
          const vx = Number(enemy.vx || 0);
          const vy = Number(enemy.vy || 0);
          const speed = Math.min(150, Math.hypot(vx, vy));
          const fallbackAngle = Number.isFinite(Number(enemy._lastHitAngle))
            ? Number(enemy._lastHitAngle)
            : Math.atan2(vy, vx || 1);
          const direction = speed > 8 ? Math.atan2(vy, vx) : fallbackAngle;
          const type = enemy.type || 'hunter';
          const boss = !!enemy.boss || type === 'god';
          const elite = !!enemy.elite;
          const launchScale = boss ? 1.45 : elite ? 1.22 : 1;
          body = {
            id: stableNumericId(enemy.id), sourceEnemyId: String(enemy.id),
            x: Number(enemy.x || 0), y: Number(enemy.y || 0),
            vx: speed > 8 ? vx : Math.cos(direction) * 42 * launchScale,
            vy: speed > 8 ? vy : Math.sin(direction) * 42 * launchScale,
            r: Number(enemy.radius || 20), size: Math.max(30, Number(enemy.radius || 20) * 2.4),
            type, spriteKey: this.neo.getEnemySpriteKey?.(enemy) || type,
            face: Number(enemy.facing || (vx < 0 ? -1 : 1)),
            age: authorityAge,
            life: Number(this.neo.CORPSE_LIFETIME || 11),
            fadeStart: Number(this.neo.CORPSE_FADE_START || 8),
            fallTime: boss ? Number(this.neo.CORPSE_FALL_TIME || 0.45) * 1.35 : Number(this.neo.CORPSE_FALL_TIME || 0.45),
            angle: direction + Math.PI / 2, fallAngle: elite ? 0.25 : 0,
            angularOffset: 0, angularV: (elite ? 8.4 : 7.2) * (Math.sin(stableNumericId(enemy.id)) >= 0 ? 1 : -1),
            angularDrag: boss ? 1.6 : 2.3,
            z: 0, vz: (150 + speed * 0.4 + (boss ? 55 : elite ? 24 : 0)) * launchScale,
            gravity: boss ? 500 : 560, bounce: boss ? 0.36 : elite ? 0.3 : 0.24,
            slideDrag: boss ? 4.2 : 5.8, airDrag: boss ? 1.2 : 1.9,
            elite, leavesBloodPool: type !== 'golem' && type !== 'bulk_golem',
            bloodColor: ['golem', 'bulk_golem'].includes(type) ? '' : type === 'god' ? '#f2ecff' : elite ? '#c04a14' : '#8d0018',
          };
          this.presentationBodies.set(id, body);
        } else {
          // A late snapshot can only advance the authoritative corpse clock;
          // never rewind its local ragdoll position, rotation, or velocity.
          body.age = Math.max(Number(body.age || 0), authorityAge);
        }
        return body;
      });
      const roomInteractables = Object.values(state?.interactables || {});
      const presentationChests = this._stablePresentationEntities(
        this.presentationInteractables,
        roomInteractables.filter(interactable => ['relic_chest', 'endless_chest', 'intermission_chest'].includes(interactable.kind)),
        interactable => ({
          id: interactable.id,
          roomId: interactable.roomId,
          x: Number(interactable.x || 0),
          y: Number(interactable.y || 0),
          open: !!interactable.opened || !!interactable.activated,
          locked: ['endless_chest', 'intermission_chest'].includes(interactable.kind) && !interactable.opened,
          intermissionShopChest: !!interactable.intermissionShopChest,
          endlessShopChest: !!interactable.endlessShopChest,
          bossRushShopChest: !!interactable.bossRushShopChest,
          price: Number(interactable.price || 0),
          choiceType: interactable.choiceType || '',
          rewardType: interactable.rewardType || 'item',
          rewardKey: interactable.rewardKey || '',
        }),
      );
      rooms.forEach(room => {
        room.chests = presentationChests.filter(chest => chest.roomId === room.id);
      });
      this.neo.chests = this.neo.currentRoom?.chests || [];
      const presentationPickupSources = [
        ...Object.values(pickups || {}).filter(pickup => pickup.roomId === floorState.currentRoomId),
        ...roomInteractables
          .filter(interactable => interactable.kind === 'stairs' && interactable.roomId === floorState.currentRoomId)
          .map(interactable => ({
            ...interactable,
            type: 'ladder',
            networkExit: true,
          })),
        ...this._upgradePresentationPickups(state).filter(choice => choice.roomId === floorState.currentRoomId),
        ...this._specialRoomPresentationPickups(floorState),
      ];
      this.neo.pickups = this._stablePresentationEntities(
        this.presentationPickups,
        presentationPickupSources,
        pickup => ({
          ...pickup,
          value: Number(pickup.amount || pickup.value || 1),
          r: Number(pickup.radius || pickup.r || 13),
        }),
      );
      const authoritativeAbilityHazards = this._stablePresentationEntities(
        this.presentationHazards,
        Object.values(state?.abilityEntities || {}).filter(entity => entity.roomId === floorState.currentRoomId),
        entity => ({ ...entity, r: Number(entity.radius || entity.r || 32), ttl: Math.max(0, Number(entity.expiresTick || 0) - Number(state?.tick || 0)) / 20 }),
      );
      this.neo.hazards = [...(this.neo.currentRoom?.hazards || []), ...authoritativeAbilityHazards];
      this.neo.decorations = this.neo.currentRoom?.decorations || [];
      this.neo.structures = this.neo.currentRoom?.structures || [];
      this.neo.destructibles = this.neo.currentRoom?.destructibles || [];
      this.neo.environmentBackgroundCache = this.neo.environmentBackgroundCache || { key: '', canvas: null };
    }

    _updateHud(state, players) {
      const localPlayer = players[this._sessionPlayerId()];
      if (!localPlayer || !state) return;
      this._setCampaignHudVisible(true);
      this.neo.updateHud?.();
      // Campaign HUD updates own the shared widgets. Reassert the network layer
      // boundary afterward so no legacy layer can be revealed by a refresh.
      this._setCampaignHudVisible(true);
    }

  }

  // The historical name remains available while callers migrate. This adapter
  // has no independent world renderer: it projects authority state into the
  // campaign renderer and is equally valid for any remote authority.
  const CampaignPresentationAdapter = NetworkGameView;

  return {
    INPUT_INTERVAL_MS,
    INPUT_AIM_SEND_INTERVAL_MS,
    INPUT_HEARTBEAT_MS,
    INTERPOLATION_DELAY_MS,
    MAX_REMOTE_EXTRAPOLATION_MS,
    MAX_SMOOTH_RECONCILIATION_PX,
    normalizeMovement,
    computeWorldTransform,
    computeCameraTransform,
    interpolatePlayers,
    predictPosition,
    PLAYER_COLORS,
    derivePlayerColor,
    deriveEnemyProjectileColor,
    deriveProjectileColor,
    ABILITY_PRESENTATIONS,
    deriveAbilityPresentation,
    planChargedProjectilePreview,
    planPredictedDashPreview,
    NetworkGameView,
    CampaignPresentationAdapter,
  };
});
