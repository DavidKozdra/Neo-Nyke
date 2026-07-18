const fs = require('node:fs');
const path = require('node:path');
const { quoteForgeCommand, voucherFreeSteps, applyForgeCommand } = require('../js/simulation/SharedForgeSystem');

describe('Forge Voucher', () => {
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');

  test('covers staged forge steps before charging XP or gold', () => {
    const player = {
      items: { forge_voucher: 1 }, forgeVoucherCharges: 2, xp: 100, coins: 0,
      ownedWeapons: { hunters_bow: true }, ownedMoves: {},
    };
    const command = {
      currency: 'xp', staged: {
        'weapon:hunters_bow:damage': 3,
        'weapon:hunters_bow:range': 5,
      },
    };
    const cost = quoteForgeCommand(player, command, {
      WEAPON_BASE_STATS: { hunters_bow: { damage: 28, range: 180 } }, MOVE_BASE_STATS: {},
    });

    expect(cost.voucherSteps).toBe(7);
    expect(cost.stagedSteps).toBe(8);
    // 7 staged steps are covered by the voucher; the one paid step is the 8th
    // step on the run-wide curve: ceil(13 * 1.05^7) = 19.
    expect(cost.xp).toBe(19);
    expect(cost.gold).toBe(0);
  });

  test('spends loose forge charges first and preserves partial voucher leftovers', () => {
    const player = {
      items: { forge_voucher: 1 }, forgeVoucherCharges: 1, xp: 100, coins: 0,
      ownedWeapons: { hunters_bow: true }, ownedMoves: {},
    };
    expect(voucherFreeSteps(player)).toBe(6);
    const result = applyForgeCommand(player, {
      currency: 'xp', staged: { 'weapon:hunters_bow:damage': 4 },
    }, { WEAPON_BASE_STATS: { hunters_bow: { damage: 28 } }, MOVE_BASE_STATS: {} });
    expect(result.voucherSteps).toBe(4);
    expect(player.items.forge_voucher).toBe(0);
    expect(player.forgeVoucherCharges).toBe(2);
  });

  test('initializes and migrates the forge voucher charge counter', () => {
    expect(gameStateSource).toContain('forge_voucher: 0');
    expect(gameStateSource).toContain('forgeVoucherCharges: 0');
    expect(playerSource).toContain('playerData.forgeVoucherCharges = Math.max(0, Math.floor(Number(playerData.forgeVoucherCharges || 0)))');
  });

  test('boss deaths have a high extra Forge Voucher drop chance', () => {
    expect(combatSource).toContain('const FORGE_VOUCHER_BOSS_DROP_CHANCE = 0.65');
    expect(combatSource).toContain("const key = Neo.FORGE_VOUCHER_KEY || 'forge_voucher'");
    expect(combatSource).toContain("Neo.pickups.push({ x: enemy.x - 28, y: enemy.y, type: 'item', key })");
    expect(combatSource).toContain('!options.forceDeath');
  });
});
