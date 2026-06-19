const fs = require('node:fs');
const path = require('node:path');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

describe('Forge Voucher', () => {
  const panelsSource = fs.readFileSync(path.join(__dirname, '../js/ui/panels.js'), 'utf8');
  const combatSource = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');

  function loadForgeCostHelpers(Neo) {
    return new Function(
      'Neo',
      [
        'const FORGE_COST_GROWTH = 0.05;',
        extractFunction(panelsSource, 'getAnvilStepCost'),
        extractFunction(panelsSource, 'getForgeUpgradesApplied'),
        extractFunction(panelsSource, 'getAnvilStepCostAtIndex'),
        extractFunction(panelsSource, 'getForgeVoucherStepValue'),
        extractFunction(panelsSource, 'getForgeVoucherFreeSteps'),
        extractFunction(panelsSource, 'getAnvilStagedStepCount'),
        extractFunction(panelsSource, 'getAnvilTotalCost'),
        extractFunction(panelsSource, 'consumeForgeVoucherSteps'),
        'return { getAnvilTotalCost, consumeForgeVoucherSteps, getForgeVoucherFreeSteps };',
      ].join('\n'),
    )(Neo);
  }

  test('covers staged forge steps before charging XP or gold', () => {
    const Neo = {
      FORGE_VOUCHER_KEY: 'forge_voucher',
      FORGE_VOUCHER_UPGRADE_STEPS: 5,
      anvilPayCurrency: 'xp',
      anvilStagedUpgrades: {
        'weapon:hunters_bow:damage': 3,
        'weapon:hunters_bow:range': 5,
      },
      player: {
        items: { forge_voucher: 1 },
        forgeVoucherCharges: 2,
      },
      WEAPON_UPGRADEABLE_STATS: {
        damage: { xpPerStep: 10, goldPerStep: 5 },
        range: { xpPerStep: 4, goldPerStep: 3 },
      },
      MOVE_UPGRADEABLE_STATS: {},
    };
    const { getAnvilTotalCost } = loadForgeCostHelpers(Neo);

    const cost = getAnvilTotalCost();

    expect(cost.voucherSteps).toBe(7);
    expect(cost.stagedSteps).toBe(8);
    // 7 staged steps are covered by the voucher; the one paid step is the 8th
    // step on the run-wide curve: ceil(4 * 1.05^7) = 6.
    expect(cost.xp).toBe(6);
    expect(cost.gold).toBe(0);
  });

  test('spends loose forge charges first and preserves partial voucher leftovers', () => {
    const Neo = {
      FORGE_VOUCHER_KEY: 'forge_voucher',
      FORGE_VOUCHER_UPGRADE_STEPS: 5,
      player: {
        items: { forge_voucher: 1 },
        forgeVoucherCharges: 1,
      },
    };
    const { consumeForgeVoucherSteps, getForgeVoucherFreeSteps } = loadForgeCostHelpers(Neo);

    expect(getForgeVoucherFreeSteps()).toBe(6);
    expect(consumeForgeVoucherSteps(4)).toBe(4);
    expect(Neo.player.items.forge_voucher).toBe(0);
    expect(Neo.player.forgeVoucherCharges).toBe(2);
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
