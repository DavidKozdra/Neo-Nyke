const fs = require('node:fs');
const path = require('node:path');

describe('minimap room icons', () => {
  const specialRooms = fs.readFileSync(path.join(__dirname, '../js/game/specialRooms.js'), 'utf8');
  const hud = fs.readFileSync(path.join(__dirname, '../js/draw/hud.js'), 'utf8');

  test('service rooms use readable unique abbreviations', () => {
    const expected = {
      shrine: 'SH',
      bounty: 'BO',
      reliquary: 'RE',
      oracle: 'OR',
      portal: 'PO',
      prison: 'PR',
      wishing_well: 'WW',
    };

    Object.entries(expected).forEach(([type, glyph]) => {
      const definitionStart = specialRooms.indexOf(`${type}: {`);
      expect(definitionStart).toBeGreaterThanOrEqual(0);
      expect(specialRooms.slice(definitionStart, definitionStart + 180)).toContain(`glyph: '${glyph}'`);
    });
    expect(specialRooms).not.toContain("glyph: 'K'");
  });

  test('all major revealed room types have an explicit pictured icon', () => {
    expect(hud).toContain("god: ['god', 'GOD', '#ffffff', 'square', 'GD', 'crown']");
    expect(hud).toContain("challenge: ['trial', 'TRIAL', '#d7f6ff', 'square', 'TR', 'trial']");
    expect(hud).toContain("boss: ['boss-room', 'BOSS', '#ff7a7a', 'square', 'BS', 'boss']");
    expect(hud).toContain("treasure: ['treasure', 'LOOT', '#ffaa00', 'square', 'LO', 'chest']");
    expect(hud).toContain("anvil: ['anvil', 'FORGE', '#ffb840', 'square', '⚒', 'anvil']");
  });

  test('uses high-contrast pixel silhouettes and an authored forge sprite in larger cells', () => {
    expect(hud).toContain('const baseSize = 24');
    expect(hud).toContain("if (icon === 'chest')");
    expect(hud).toContain("else if (icon === 'ladder')");
    expect(hud).toContain("drawRoomGlyph('$', x, y, roomExplored)");
    expect(hud).toContain("icon === 'anvil' ? 'anvil_0'");
    expect(hud).toContain("drawRoomIcon('ladder', '★'");
  });
});
