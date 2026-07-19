const fs = require('node:fs');
const path = require('node:path');
const { applyExtraBatterySelection } = require('../js/simulation/SharedAcquisitionSystem');

function extractFunction(sourcePath, functionName, dependencies = {}) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const exportPrefix = `export function ${functionName}`;
  const plainPrefix = `function ${functionName}`;
  const start = source.indexOf(exportPrefix) >= 0
    ? source.indexOf(exportPrefix)
    : source.indexOf(plainPrefix);
  if (start < 0) throw new Error(`Missing function ${functionName}`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }

  const declaration = source
    .slice(start, end + 1)
    .replace('export function', 'function');
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return new Function(...names, `${declaration}; return ${functionName};`)(...values);
}

describe('Extra Battery wiring', () => {
  const playerPath = path.join(__dirname, '../js/game/player.js');
  const combatPath = path.join(__dirname, '../js/game/combat.js');

  function makeNeo(player) {
    return {
      player,
      MOVE_DEFS: {
        slash: { key: 'slash', slot: 'melee', name: 'Slash' },
        blood_beam: { key: 'blood_beam', slot: 'laser', name: 'Blood Beam' },
      },
      WEAPON_DEFS: { hunters_bow: { key: 'hunters_bow', name: "Hunter's Bow" } },
      getWeaponMaxCharges: (weaponKey, playerState) => Math.max(
        1,
        Math.floor(Number(playerState?.weaponChargeOverrides?.[weaponKey] || 0)),
      ),
      getMoveMaxStacks: () => 1,
      createCooldownEntry: () => ({ charges: 1, maxCharges: 2, timers: [], holding: 0 }),
      cooldowns: {},
      markInventoryPanelDirty: jest.fn(),
      updateHud: jest.fn(),
      scheduleRunSave: jest.fn(),
    };
  }

  test('melee battery with a weapon equipped lands on the weapon-charge pool', () => {
    const player = {
      equippedWeapon: 'hunters_bow',
      equippedMoves: {},
      ownedMoves: { slash: true },
      extraBatteryPendingCount: 1,
    };
    const Neo = makeNeo(player);
    const grantExtraBatteryToMove = extractFunction(playerPath, 'grantExtraBatteryToMove', {
      Neo,
      globalThis: { NeoNyke: { simulation: { applyExtraBatterySelection } } },
    });

    const nextMaxCharges = grantExtraBatteryToMove('slash');

    expect(nextMaxCharges).toBe(2);
    expect(player.weaponChargeOverrides.hunters_bow).toBe(2);
    expect(player.extraBatteryPendingCount).toBe(0);
    expect(player.moveStackOverrides).toBeUndefined();
    expect(Neo.updateHud).toHaveBeenCalled();
  });

  test('melee battery without a weapon falls back to slash move stacks', () => {
    const player = {
      equippedWeapon: '',
      equippedMoves: {},
      ownedMoves: { slash: true },
      extraBatteryPendingCount: 1,
    };
    const Neo = makeNeo(player);
    const grantExtraBatteryToMove = extractFunction(playerPath, 'grantExtraBatteryToMove', {
      Neo,
      globalThis: { NeoNyke: { simulation: { applyExtraBatterySelection } } },
    });

    const nextMaxStacks = grantExtraBatteryToMove('slash');

    expect(nextMaxStacks).toBe(2);
    expect(player.moveStackOverrides.slash).toBe(2);
    expect(player.weaponChargeOverrides).toBeUndefined();
    // The melee slot is empty (bare-hands fallback), but the live cooldown
    // entry must still refresh so the new charge shows immediately.
    expect(Neo.cooldowns.melee).toBeDefined();
  });

  test('getWeaponMaxCharges honors battery overrides and can make a 1-charge weapon charged', () => {
    const player = { weaponChargeOverrides: { extending_staff: 2 } };
    // Charge caps now live on the canonical Neo.WEAPON_DEFS registry (maxCharges
    // field) rather than a separate CHARGED_WEAPON_MAX_CHARGES map.
    const Neo = { player, WEAPON_DEFS: { magenta_p90: { maxCharges: 5 } } };
    const getWeaponMaxCharges = extractFunction(combatPath, 'getWeaponMaxCharges', { Neo });

    expect(getWeaponMaxCharges('extending_staff', player)).toBe(2);
    expect(getWeaponMaxCharges('magenta_p90', player)).toBe(5);
    expect(getWeaponMaxCharges('extending_staff', {})).toBe(1);

    const isChargedWeaponKey = extractFunction(combatPath, 'isChargedWeaponKey', {
      Neo,
      getWeaponMaxCharges,
    });
    expect(isChargedWeaponKey('extending_staff', player)).toBe(true);
    expect(isChargedWeaponKey('extending_staff', {})).toBe(false);
  });

  test('ensureWeaponChargeState refills the pool when the max rises', () => {
    const player = {
      weaponChargeKey: 'magenta_p90',
      weaponCharges: 3,
      weaponMaxCharges: 5,
      weaponChargeTimers: [1.2, 0.8],
      weaponChargeOverrides: { magenta_p90: 6 },
    };
    const deps = {
      Neo: { player, WEAPON_DEFS: { magenta_p90: { maxCharges: 5 } } },
    };
    const getWeaponMaxCharges = extractFunction(combatPath, 'getWeaponMaxCharges', deps);
    const isChargedWeaponKey = extractFunction(combatPath, 'isChargedWeaponKey', { ...deps, getWeaponMaxCharges });
    const ensureWeaponChargeState = extractFunction(combatPath, 'ensureWeaponChargeState', {
      ...deps,
      getWeaponMaxCharges,
      isChargedWeaponKey,
    });

    const state = ensureWeaponChargeState('magenta_p90', player);

    expect(state.maxCharges).toBe(6);
    expect(state.charges).toBe(6);
    expect(player.weaponMaxCharges).toBe(6);
  });
});
