const fs = require('node:fs');
const path = require('node:path');

describe('3D renderer gameplay parity', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../js/draw/three-renderer.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

  test('uses the authored pillar stack and grounded service/treasure props', () => {
    expect(renderer).toContain("const segments = ['pillar_1', ...Array(mids).fill('pillar_2'), 'pillar_3'];");
    expect(renderer).toContain("const key = structure.kind === 'anvil' ? 'anvil_0' : 'forge_0';");
    expect(renderer).toContain('prop.position.set(structure.x, 0, structure.y);');
    expect(renderer).toContain('sprite.scale.set(64, 64, 1);');
    expect(renderer).toContain('makeGroundedBillboard');
  });

  test('renders live combat beam paths instead of a fixed visual-only beam', () => {
    expect(renderer).toContain('function getPlayerBeamVisual()');
    expect(renderer).toContain('Neo.activeBeamPaths');
    expect(renderer).toContain("color: '#cda8ff'");
    expect(renderer).toContain('Neo.getPlayerBeamRange?.(mode, move)');
    expect(renderer).toContain('function getEnemyBeamVisual(enemy)');
    expect(renderer).toContain('Neo.getEnemyBeamBounceCount?.(enemy)');
  });

  test('keeps UI clicks out of first-person pointer lock and preserves the canvas input layer', () => {
    expect(renderer).toContain('event.target !== Neo.canvas');
    expect(renderer).toContain('!Neo.isOverlayBlockingInput?.()');
    expect(styles).toMatch(/#c3d\s*\{[\s\S]*?pointer-events:\s*none;/);
  });

  test('projects third-person mouse aim to the same 3D floor the player sees', () => {
    const update = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
    expect(renderer).toContain('function projectCanvasMouseToWorld(canvasX, canvasY)');
    expect(renderer).toContain('mouseAimRay.setFromCamera(mouseAimNdc, camera);');
    expect(renderer).toContain('Neo.projectCanvasMouseToWorld = projectCanvasMouseToWorld;');
    expect(update).toContain('const _perspectiveAim = Neo.projectCanvasMouseToWorld?.(_clampedMouseX, Neo.mouse.y);');
  });
});
