const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('shared pillar renderer', () => {
  test('stacks variable shafts upward while keeping one fixed base ground line', () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/draw/pillar-renderer.js'), 'utf8');
    const calls = [];
    const ctx = {
      save() {},
      restore() {},
      translate() {},
      drawImage(...args) { calls.push(args); },
      imageSmoothingEnabled: true,
    };
    const images = {
      pillar_1: { id: 'base' },
      pillar_2: { id: 'shaft' },
      pillar_3: { id: 'cap' },
    };
    const sandbox = { globalThis: {} };
    vm.runInNewContext(source, sandbox);

    expect(sandbox.globalThis.NeoPillarRenderer.drawPillarSprite(
      ctx,
      { x: 100, y: 200, w: 40, h: 40, mids: 2 },
      images,
    )).toBe(true);
    expect(calls.map(call => [call[0].id, call[2]])).toEqual([
      ['cap', -140],
      ['shaft', -100],
      ['shaft', -60],
      ['base', -20],
    ]);
    expect(calls.at(-1).slice(2, 6)).toEqual([-20, 40, 40]);
  });

  test('gameplay and menu backgrounds both call the shared renderer', () => {
    const environment = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');
    const menu = fs.readFileSync(path.join(__dirname, '../js/ui/menu-background.js'), 'utf8');
    expect(environment).toContain('NeoPillarRenderer?.drawPillarSprite');
    expect(menu).toContain('NeoPillarRenderer?.drawPillarSprite');
    expect(menu).toContain("pillar_1: 'assets/sprites/env/pillar_1.png'");
    expect(menu).toContain("pillar_2: 'assets/sprites/env/pillar_2.png'");
    expect(menu).toContain("pillar_3: 'assets/sprites/env/pillar_3.png'");
  });

  test('menu ground details render below standing props', () => {
    const menu = fs.readFileSync(path.join(__dirname, '../js/ui/menu-background.js'), 'utf8');
    const roomPropsStart = menu.indexOf('function drawRoomProps');
    const groundPass = menu.indexOf('// Ground-detail pass.', roomPropsStart);
    const debrisDraw = menu.indexOf("drawMenuProp(g, mossy ? 'moss_patch' : 'rubble'", groundPass);
    const standingPass = menu.indexOf('// Standing-prop pass.', groundPass);
    const pillarDraw = menu.indexOf("drawMenuProp(g, 'pillar'", standingPass);
    expect(groundPass).toBeGreaterThan(roomPropsStart);
    expect(debrisDraw).toBeGreaterThan(groundPass);
    expect(standingPass).toBeGreaterThan(debrisDraw);
    expect(pillarDraw).toBeGreaterThan(standingPass);
  });
});
