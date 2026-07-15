const fs = require('node:fs');
const path = require('node:path');

describe('minimap room glyphs', () => {
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

  test('all major revealed room types have an explicit glyph', () => {
    expect(hud).toContain("god: ['god', 'GOD', '#ffffff', 'square', 'GD']");
    expect(hud).toContain("challenge: ['trial', 'TRIAL', '#d7f6ff', 'square', 'TR']");
    expect(hud).toContain("boss: ['boss-room', 'BOSS', '#ff7a7a', 'square', 'BS']");
    expect(hud).toContain("treasure: ['treasure', 'LOOT', '#ffaa00', 'square', 'LO']");
    expect(hud).toContain("start: ['start', 'START', '#00ff88', 'square', 'ST']");
  });

  test('uses the marker table for cells and fits multi-character glyphs', () => {
    expect(hud).toContain('const roomGlyph = roomTypeLegend[room.type]?.[4]');
    expect(hud).toContain('const compactGlyph = glyphText.length > 1');
    expect(hud).toContain('if (roomGlyph) drawRoomGlyph(roomGlyph, x, y, roomExplored)');
  });
});
