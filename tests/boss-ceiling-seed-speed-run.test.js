const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(root, 'js/draw/three-renderer.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inputSource = fs.readFileSync(path.join(root, 'js/ui/input.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'js/ui/controller.js'), 'utf8');
const gameStateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed ${name}`);
}

function ceilingHeightFor({ roomType = 'combat', gameMode = 'normal', enemies = [] } = {}) {
  const Neo = { currentRoom: { type: roomType }, gameMode, enemies };
  const declaration = extractFunction(rendererSource, 'getRoomCeilingHeight');
  const getRoomCeilingHeight = new Function(
    'Neo',
    'BOSS_ARENA_WALL_HEIGHT',
    'WALL_HEIGHT',
    `${declaration}; return getRoomCeilingHeight;`,
  )(Neo, 320, 112);
  return getRoomCeilingHeight();
}

describe('boss arena ceiling height', () => {
  test.each(['boss', 'god', 'ladder'])('%s rooms use the vaulted ceiling', roomType => {
    expect(ceilingHeightFor({ roomType })).toBe(320);
  });

  test('Boss Rush and live Bulk Golems raise otherwise normal rooms', () => {
    expect(ceilingHeightFor({ gameMode: 'boss_rush' })).toBe(320);
    expect(ceilingHeightFor({ enemies: [{ type: 'bulk_golem', dead: false }] })).toBe(320);
    expect(ceilingHeightFor({ enemies: [{ type: 'bulk_golem', dead: true }] })).toBe(112);
    expect(ceilingHeightFor()).toBe(112);
  });

  test('walls, corridors, ceiling, and room cache all use the resolved height', () => {
    expect(rendererSource).toContain('mesh.scale.set(w, wallHeight, d)');
    expect(rendererSource).toContain('top.position.set(cx, wallHeight, cz)');
    expect(rendererSource).toContain('ceiling.position.set(W / 2, wallHeight, H / 2)');
    expect(rendererSource).toContain('|h${getRoomCeilingHeight(room)}|');
  });
});

describe('Seed Speed Run menu placement', () => {
  test('lives under Alternate Modes instead of the main navigation', () => {
    expect(htmlSource).not.toContain('id="mainCompetitiveBtn"');
    const altModesStart = htmlSource.indexOf('id="altModesPanel"');
    const seedCard = htmlSource.indexOf('id="altModeSeedSpeedRunCard"');
    expect(seedCard).toBeGreaterThan(altModesStart);
    expect(htmlSource).toContain('id="altModeSeedSpeedRunBtn"');
    expect(inputSource).toContain("altModeSeedSpeedRunBtn: document.getElementById('altModeSeedSpeedRunBtn')");
    expect(controllerSource).toContain("view.altModeSeedSpeedRunBtn?.addEventListener('click'");
  });

  test('uses the Seed Speed Run name throughout player-facing routing', () => {
    expect(htmlSource).toContain('>SEED SPEED RUN</h3>');
    expect(htmlSource).toContain('<span class="altmodes-title">SEED SPEED RUN</span>');
    expect(gameStateSource).toContain("if (mode === 'competitive') return 'Seed Speed Run'");
    expect(gameStateSource).toContain("goBtn.textContent = 'RUN SEED'");
  });
});
