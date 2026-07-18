const fs = require('fs');
const path = require('path');
const { GameState } = require('../js/simulation/GameState');
const { createNetworkCombatSystem } = require('../js/simulation/NetworkCombatSystem');
const forge = require('../js/simulation/SharedForgeSystem');
const { WEAPON_BASE_STATS } = require('../js/simulation/SharedCombatContent');
const { MOVE_BASE_STATS } = require('../js/simulation/SharedMoveContent');

function player(overrides = {}) {
  return {
    id: 'p1', roomId: 'forge', x: 450, y: 350, radius: 18,
    xp: 100, coins: 500, health: 120, maxHealth: 120,
    ownedWeapons: { thorns_bleed_blade: true },
    ownedMoves: { blood_beam: true }, items: {},
    ...overrides,
  };
}

describe('one shared Forge command', () => {
  test('the shared resolver prices and applies the campaign upgrade once', () => {
    const actor = player();
    const command = { currency: 'xp', staged: { 'weapon:thorns_bleed_blade:damage': 2 } };
    const content = { WEAPON_BASE_STATS, MOVE_BASE_STATS };
    const quote = forge.quoteForgeCommand(actor, command, content);
    expect(quote).toMatchObject({ ok: true, xp: 31, gold: 0, stagedSteps: 2 });
    expect(forge.applyForgeCommand(actor, command, content)).toMatchObject(quote);
    expect(actor).toMatchObject({ xp: 69, coins: 500, forgeUpgradesApplied: 2 });
    expect(actor.anvilUpgrades.weapon.thorns_bleed_blade.damage).toBe(2);
  });

  test('authority calls that exact resolver and accepts it only in the anvil room', () => {
    const actor = player();
    const state = new GameState({
      status: 'running', players: { p1: actor },
      floorState: {
        width: 900, height: 700, currentRoomId: 'forge',
        layout: { rooms: [{ id: 'forge', type: 'anvil' }] },
      },
    });
    const events = [];
    createNetworkCombatSystem({ emitEvent: (type, data) => events.push({ type, data }) })({
      state,
      inputs: { p1: { actions: [{ action: 'FORGE_COMMIT', currency: 'gold', staged: { 'move:blood_beam:damage': 1 } }] } },
      fixedDelta: 0.05,
      random: { range: () => 0.5, integer: () => 0, pick: values => values[0] },
    });
    expect(state.players.p1.coins).toBe(410);
    expect(state.players.p1.anvilUpgrades.move.blood_beam.damage).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'FORGE_COMMITTED' }));
  });

  test('the browser panel no longer implements a second Forge mutation', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/ui/panels.js'), 'utf8');
    const confirm = source.slice(source.indexOf('export function confirmAnvilUpgrades'), source.indexOf('export function renderInventoryPanel'));
    expect(confirm).toContain('applyForgeCommand');
    expect(confirm).toContain("sendGameCommand?.('FORGE_COMMIT'");
    expect(confirm).not.toContain('Neo.player.xp -=');
    expect(confirm).not.toContain('Neo.player.coins =');
    expect(confirm).not.toContain('consumeForgeVoucherSteps');
  });
});
