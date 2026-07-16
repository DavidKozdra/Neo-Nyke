const fs = require('node:fs');
const path = require('node:path');

describe('challenge starter world props', () => {
  const props = fs.readFileSync(path.join(__dirname, '../js/draw/props.js'), 'utf8');

  test('every trial has a distinct pictured altar and proximity description', () => {
    ['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm'].forEach(type => {
      expect(props).toContain(`${type}: { title:`);
    });
    expect(props).toContain('drawTrialStarterSymbol(trial, color)');
    expect(props).toContain("Neo.ctx.translate(0, -bob)");
    expect(props).toContain('STEP ONTO THE ALTAR TO BEGIN');
  });
});
