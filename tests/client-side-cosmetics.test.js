const {
  PLAYER_COLORS,
  derivePlayerColor,
  deriveEnemyProjectileColor,
  deriveProjectileColor,
} = require('../js/rendering/NetworkGameView');
const { GameState } = require('../js/simulation/GameState');
const { GameSimulation } = require('../js/simulation/GameSimulation');
const { RandomService } = require('../js/simulation/RandomService');
const { createNetworkFloorState, TEST_ROOM } = require('../js/multiplayer/LocalMultiplayerSession');
const { createNetworkCombatSystem, getHeroPrimaryAttack } = require('../js/simulation/NetworkCombatSystem');
const { PROJECTILE_TYPE_DEFS } = require('../js/simulation/SharedCombatContent');

describe('client-side cosmetics (colours derived on the client, not sent by the authority)', () => {
  test('player colour is a deterministic function of slot index', () => {
    expect(derivePlayerColor({ slotIndex: 0 })).toBe(PLAYER_COLORS[0]);
    expect(derivePlayerColor({ slotIndex: 3 })).toBe(PLAYER_COLORS[3]);
    // Two clients deriving the same player get the same colour.
    expect(derivePlayerColor({ slotIndex: 2 })).toBe(derivePlayerColor({ slotIndex: 2 }));
  });

  test('enemy projectile colour is derived from behaviour', () => {
    expect(deriveEnemyProjectileColor('beam')).toBe('#c77bff');
    expect(deriveEnemyProjectileColor('burst')).toBe('#ff9f68');
    expect(deriveEnemyProjectileColor('ranged')).toBe('#ffc477');
  });

  test('player projectile colour comes from the shared content table by kind', () => {
    const neo = { PROJECTILE_TYPE_DEFS };
    const anyKind = Object.keys(PROJECTILE_TYPE_DEFS)[0];
    expect(deriveProjectileColor({ kind: anyKind, hostile: false }, neo)).toBe(PROJECTILE_TYPE_DEFS[anyKind].color);
    // Unknown friendly projectile falls back to the player tint, not undefined.
    expect(deriveProjectileColor({ kind: 'does_not_exist', hostile: false }, neo)).toBe('#9de9ff');
  });

  test('the authority no longer embeds colour on players or projectiles', () => {
    const floorState = createNetworkFloorState({ matchSeed: 'cos', floorSeed: 'cos|floor:1', floorNumber: 1 });
    const roomId = floorState.currentRoomId;
    const state = new GameState({
      status: 'running', matchSeed: 'cos', floorSeed: 'cos|floor:1', floorState,
      players: {
        p1: {
          id: 'player-1', slotIndex: 0, characterKey: 'thorn_knight', roomId,
          x: 300, y: 350, radius: 18, moveSpeed: 180, maxHealth: 100, health: 100,
          attackCooldownUntilTick: 0, equippedWeapon: 'thorns_bleed_blade', equippedMoves: {},
        },
      },
    });
    const random = new RandomService({ matchSeed: 'cos' });
    const sim = new GameSimulation({
      state, randomService: random,
      systems: [createNetworkCombatSystem({ emitEvent: () => {} })],
    });
    // Fire the hero's primary attack so a player projectile exists.
    sim.updateGame({ p1: { moveX: 0, moveY: 0, aimDirection: 0, actions: [{ action: 'ATTACK', aimDirection: 0, inputSequence: 0 }] } }, 1 / 20);

    // No player carries a colour string.
    Object.values(state.players).forEach(p => expect(p.color).toBeUndefined());
    // No projectile carries a colour string; the client derives it.
    Object.values(state.projectiles).forEach(proj => expect(proj.color).toBeUndefined());
  });
});
