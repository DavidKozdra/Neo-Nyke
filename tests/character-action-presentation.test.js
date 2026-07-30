const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('character action presentation', () => {
  const entities = read('js/draw/entities.js');
  const viewport = read('js/draw/viewport.js');
  const particles = read('js/draw/hud.js');
  const world = read('js/game/world.js');
  const combat = read('js/game/combat.js');
  const threeRenderer = read('js/draw/three-renderer.js');

  test('authored action frames do not receive the legacy procedural body rotation', () => {
    expect(entities).toContain('if (getActorSpriteActionState(actor, animation).action)');
    expect(entities).toMatch(/anim\.spriteOffsetX = 0;\s+anim\.spriteOffsetY = 0;\s+anim\.rotation = 0;/);
  });

  test('Metao beam frames hide the detached arm while other beam arms remain above the effect', () => {
    expect(entities).toContain('if (options.hidden) return;');
    expect(entities).toContain("return !!action && (action !== 'beam' || spriteKey === 'metao')");
    expect(entities).toContain('hidden: shouldHideActorAimArm(getPlayerSpriteKey(), playerActionState.action)');
    expect(entities).toContain('hidden: shouldHideActorAimArm(spriteKey, slotActionState.action)');
    expect(threeRenderer).toContain('Neo.shouldHideActorAimArm?.(baseKey, spriteActionState.action)');
  });

  test('beam action facing follows aim instead of opposite strafe movement', () => {
    expect(entities).toContain('function getActorActionFacingDirection(actor, action, aimAngle = 0)');
    expect(entities).toContain("if (action === 'beam') return Math.cos(aimAngle) < 0 ? -1 : 1");
    expect(entities).toContain('getActorActionFacingDirection(Neo.player, playerActionState.action, beamFacingAngle)');
    expect(entities).toContain('getActorActionFacingDirection(pn, slotActionState.action, beamFacingAngle)');
    expect(threeRenderer).toContain('Neo.getActorActionFacingDirection?.(p, spriteActionState.action, beamFacingAngle)');
    expect(threeRenderer).toContain('Neo.getActorActionFacingDirection?.(actor, spriteActionState.action, beamFacingAngle)');
  });

  test('Sarge hammer smash plays its authored frames at twice the standard speed', () => {
    expect(combat).toContain("characterKey === 'sarge' && smashMoveKey === 'hammer_smash'");
    expect(combat).toMatch(/const smashSpriteDuration[\s\S]+?\? 0\.3[\s\S]+?: 0\.6;/);
    expect(combat).toContain("startPlayerSpriteAction('smash', smashSpriteDuration)");
  });

  test('AOE particles render below players while readable foreground particles remain above', () => {
    const groundPass = viewport.indexOf("Neo.drawParticles('ground')");
    const beamPass = viewport.indexOf('Neo.drawActivePlayerEffects?.()', groundPass);
    const localPlayer = viewport.indexOf('Neo.drawPlayer();', groundPass);
    const foregroundPass = viewport.indexOf("Neo.drawParticles('foreground')");
    expect(groundPass).toBeGreaterThan(-1);
    expect(beamPass).toBeGreaterThan(groundPass);
    expect(localPlayer).toBeGreaterThan(beamPass);
    expect(localPlayer).toBeGreaterThan(groundPass);
    expect(foregroundPass).toBeGreaterThan(localPlayer);
    expect(particles).toContain("layer === 'ground'");
    expect(particles).toContain("layer === 'foreground'");
    expect(world).toMatch(/function spawnAoeShockwave[\s\S]+groundFx: true/);
    expect(threeRenderer).toContain('sprite.renderOrder = particle.groundFx ? 1');
    expect(threeRenderer).toContain('body.renderOrder = 6');
  });
});
