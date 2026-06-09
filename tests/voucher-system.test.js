const fs = require('node:fs');
const path = require('node:path');

function loadVoucherData() {
  const source = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
  const dataSource = source
    .slice(0, source.indexOf('export const ui ='))
    .replace(/\bexport\s+/g, '');
  return new Function(
    'Neo',
    `${dataSource}; return { ITEM_DEFS, ITEM_KEYS, ITEM_DROP_WEIGHTS, VOUCHER_TYPES, VOUCHER_KEYS, WHITE_ITEM_POOL };`,
  )({
    buildWeightTable(entries) {
      return entries;
    },
  });
}

function loadLegacyVoucherMigration() {
  const source = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
  const match = source.match(
    /export function migrateLegacyVoucherInventory\(items\) \{[\s\S]*?\n  \}/,
  );
  if (!match) throw new Error('Could not find migrateLegacyVoucherInventory');
  const functionSource = match[0].replace('export function', 'function');
  return new Function(`${functionSource}; return migrateLegacyVoucherInventory;`)();
}

describe('voucher classes', () => {
  const data = loadVoucherData();

  test('defines distinct White, Purple, and Yellow voucher items', () => {
    expect(data.VOUCHER_TYPES).toEqual([
      expect.objectContaining({ key: 'voucher_white', label: 'White', rarity: 'knight' }),
      expect.objectContaining({ key: 'voucher_purple', label: 'Purple', rarity: 'wizard' }),
      expect.objectContaining({ key: 'voucher_yellow', label: 'Yellow', rarity: 'god' }),
    ]);
    expect(data.VOUCHER_KEYS).toEqual(['voucher_white', 'voucher_purple', 'voucher_yellow']);
    data.VOUCHER_KEYS.forEach(key => expect(data.ITEM_DEFS[key]?.voucher).toBe(true));
  });

  test('keeps total base voucher drop weight equal to the former generic voucher', () => {
    const voucherWeight = data.ITEM_DROP_WEIGHTS
      .filter(([key]) => data.VOUCHER_KEYS.includes(key))
      .reduce((total, [, weight]) => total + weight, 0);

    expect(voucherWeight).toBe(8);
  });

  test('each voucher class has selectable relics and excludes voucher loops', () => {
    data.VOUCHER_TYPES.forEach(voucher => {
      const pool = data.ITEM_KEYS.filter(key => (
        data.ITEM_DEFS[key]?.rarity === voucher.rarity && !data.ITEM_DEFS[key]?.voucher
      ));
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.some(key => data.VOUCHER_KEYS.includes(key))).toBe(false);
    });
    expect(data.WHITE_ITEM_POOL.some(key => data.VOUCHER_KEYS.includes(key))).toBe(false);
  });
});

describe('legacy voucher migration', () => {
  const migrateLegacyVoucherInventory = loadLegacyVoucherMigration();

  test('converts generic vouchers to Yellow vouchers without losing copies', () => {
    const items = { voucher: 2, voucher_yellow: 1, neo_knife: 3 };

    expect(migrateLegacyVoucherInventory(items)).toEqual({
      voucher_yellow: 3,
      neo_knife: 3,
    });
  });
});

describe('voucher picker markup', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  test('provides searchable choices and explicit confirmation', () => {
    expect(html).toContain('id="voucherSearch"');
    expect(html).toContain('id="voucherChoices"');
    expect(html).toContain('id="voucherConfirm"');
    expect(html).not.toContain('You will receive a random relic of that rarity.');
  });
});
