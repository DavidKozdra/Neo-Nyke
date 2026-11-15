const fs = require('node:fs');
const path = require('node:path');
const movement = require('../js/simulation/CampaignMovementRules');

const updateSource = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8')
  .replace(/^export\s*\{[^}]*\};?/gm, '')
  .replace(/\bexport\s+/g, '');

function createHarness({ enemies = [], hasRobotArm = true, meleeHeld = false, blocked = false, stun = 0 } = {}) {
  const attacks = [];
  const Neo = {
    player: { x: 100, y: 100, vx: 0, vy: 0, inv: 0, stun },
    // Keep enemy AI in its spawn delay while exercising the full player tick.
    enemies: enemies.map(enemy => enemy && { spawnT: 1, ...enemy }),
    mouse: { x: 300, y: 400, worldX: 300, worldY: 400 },
    camera: { x: 0, y: 0 },
    keys: {},
    ui: {},
    gameState: 'play',
    gameMode: 'normal',
    gameElapsedTime: 0,
    lavaAnimTime: 0,
    floorTransitionTime: 0,
    getItemStats: () => ({ hasRobotArm, moveSpeedMultiplier: 1 }),
    getPlayableEnemyBodyContext: () => ({}),
    isPanelOpen: () => false,
    isOverlayBlockingInput: () => blocked,
    isMouseActionHeld: action => action === 'slash' && meleeHeld,
    tryMelee: options => attacks.push({ x: Neo.mouse.worldX, y: Neo.mouse.worldY, ...options }),
  };
  for (const name of [
    'perfStart', 'perfEnd', 'compactEnemyList', 'tickCooldowns', 'moveCircle',
    'updateFirstRunTutorialProgress', 'updatePointerAimWorld', 'updateWeaponSystems',
    'updateRivals', 'updateMonsterDoorRoaming', 'updatePlayerLaser', 'updateChallengeRoomState',
    'updateProjectiles', 'updateWorldProps', 'updatePlayerStatuses', 'updateChests',
    'updatePickups', 'updateGardenGrowth', 'updateDeadBodies', 'updateParticles', 'updateTransitions',
  ]) Neo[name] = () => {};

  new Function('Neo', 'globalThis', 'window', 'document', 'NeoTouch', updateSource)(
    Neo, { NeoNyke: { simulation: movement } }, {}, { getElementById: () => null }, null,
  );
  return { Neo, attacks, tick: () => Neo.update(0.05) };
}

describe('Robot Arm automatic aim', () => {
  test('attacks the nearest living enemy without input and restores pointer aim', () => {
    const harness = createHarness({ enemies: [
      { x: 250, y: 100 },
      null,
      { x: 101, y: 100, dead: true },
      { x: 100, y: 140 },
    ] });

    harness.tick();

    expect(harness.attacks).toEqual([{ x: 100, y: 140, useRobotArmCharge: true }]);
    expect(harness.Neo.mouse).toEqual({ x: 300, y: 400, worldX: 300, worldY: 400 });
  });

  test.each([{ enemies: [] }, { enemies: [null, { x: 101, y: 100, dead: true }] }])(
    'does not auto-attack when no living enemy remains (%j)', ({ enemies }) => {
      const harness = createHarness({ enemies });
      harness.tick();
      expect(harness.attacks).toEqual([]);
    },
  );

  test('manual melee still works with Robot Arm in an empty room', () => {
    const harness = createHarness({ meleeHeld: true });
    harness.tick();
    expect(harness.attacks).toEqual([{ x: 300, y: 400, useRobotArmCharge: false }]);
  });

  test.each([{ blocked: true }, { stun: 1 }, { hasRobotArm: false }])(
    'does not auto-attack while disabled: %j', options => {
      const harness = createHarness({ ...options, enemies: [{ x: 100, y: 140 }] });
      harness.tick();
      expect(harness.attacks).toEqual([]);
    },
  );
});
