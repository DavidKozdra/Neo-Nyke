const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('local co-op systems use active player slots', () => {
  const world = read('js/game/world.js');
  const update = read('js/core/update.js');
  const rooms = read('js/game/rooms.js');
  const combat = read('js/game/combat.js');
  const input = read('js/core/math-utils.js');
  const gamepad = read('js/gamepadControls.js');
  const viewport = read('js/draw/viewport.js');
  const entities = read('js/draw/entities.js');
  const renderer3d = read('js/draw/three-renderer.js');

  test('derives party membership from active slots instead of inactive dead flags', () => {
    expect(world).toContain('function getLocalCoopSlots({ livingOnly = false } = {})');
    expect(world).toContain('getLocalCoopSlots({ livingOnly: true }).length === 0');
    expect(world).not.toContain('Neo.p1DeadInCoop && Neo.p2DeadInCoop && Neo.p3DeadInCoop && Neo.p4DeadInCoop');
  });

  test('supports proximity revives with recovery health and invulnerability', () => {
    expect(world).toContain('LOCAL_COOP_REVIVE_RADIUS = 58');
    expect(world).toContain('LOCAL_COOP_REVIVE_SECONDS = 1.35');
    expect(world).toContain('applyCampaignRevive?.(actor');
    expect(update).toContain('Neo.updateLocalCoopRevives?.(dt)');
  });

  test('lets any living teammate lead a room transition and moves the party', () => {
    const transitions = world.slice(world.indexOf('function updateTransitions('), world.indexOf('function spawnLoopBlueRewardChoices('));
    expect(transitions).toContain('getLocalCoopSlots({ livingOnly: true })');
    expect(transitions).toContain('Neo.transitionLeaderSlotId = leaderSlotId');
    expect(transitions).toContain('positionLocalCoopParty(doorX, doorY, direction)');
    expect(rooms).toContain('Neo.positionLocalCoopParty(safeSpawn.x, safeSpawn.y)');
  });

  test('uses right-stick aim and character speed for every auxiliary player', () => {
    expect(world).toContain('function getAuxPlayerMoveSpeed(player)');
    expect(world).toContain('function getAuxPlayerAimAngle(player');
    expect(world).toContain('const aimAngle = p2AimAngle;');
    expect(world).toContain('const aimAngle = getAuxPlayerAimAngle(pn, nX, nY, _gpN)');
  });

  test('enemy homing and direct projectile hits select living player slots', () => {
    expect(world).toContain('getNearestLivingPlayerSlot(projectile.x, projectile.y)?.entity');
    expect(world).toContain('const hitSlot = getLocalCoopSlots({ livingOnly: true }).find');
    expect(world).toContain('damagePlayerSlot(hitSlot, projectile.damage || 10');
    expect(world).toContain('applyProjectileStatusEffectsToPlayer(projectile, hitPlayer)');
  });

  test('enemy explosions and authored hazards damage the whole party', () => {
    expect(world).toContain('function damagePlayerSlot(slot, amount');
    expect(world).toMatch(/if \(sourceEnemy\) getLocalCoopSlots\(\{ livingOnly: true \}\)\.forEach/);
    for (const hazard of ['thorn_mine', 'bomb_aoe', 'lava', 'explosive_trap', 'red_spikes', 'chaos_burst', 'lightning_column', 'lightning_strike_line', 'holy_turret']) {
      expect(world).toContain(`hazard.kind === '${hazard}'`);
    }
  });

  test('nearest teammates can collect pickups, heal, open chests, and find secrets', () => {
    expect(world).toContain('pickupPlayer = nearestPlayer || Neo.player');
    expect(world).toContain('const nearest = getNearestLivingPlayerSlot(chest.x, chest.y)');
    expect(world).toContain('const coopPlayerTouchesProp');
    expect(world).toContain('healPickupPlayer(potionHeal)');
  });

  test('shared XP advances each active co-op character', () => {
    expect(combat).toContain("if (Neo.gameMode === 'coop')");
    expect(combat).toContain('(Neo.getActivePlayerSlots?.() || []).forEach');
    expect(combat).toContain('applyCampaignLevelUp?.(actor)');
  });

  test('gamepad interaction identifies its player for ladders and room services', () => {
    expect(gamepad).toContain('game?.triggerInteract?.(slotIndex + 1)');
    expect(input).toContain('function triggerInteract(slotId = 1)');
    expect(input).toContain('Neo.isAtLadder?.(actor)');
  });

  test('downed local players remain visible with revive progress in 2D and 3D', () => {
    expect(viewport).toMatch(/if \(drawSlot\.getDead\(\)\) \{\s+Neo\.drawPlayerSlot\(drawSlot\)/);
    expect(entities).toContain('pn.networkDowned || slot.getDead?.()');
    expect(entities).toContain('pn.coopReviveProgress');
    expect(renderer3d).toContain('const downed = !!actor.networkDowned || !!slot?.getDead?.()');
  });
});
