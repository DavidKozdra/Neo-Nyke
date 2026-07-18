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

  test('retains the shared player walk, arm, and death presentation in third person', () => {
    expect(renderer).toContain('Neo.getActorSpriteFrameKey?.(baseKey, p');
    expect(renderer).toContain('function syncPlayerArm(group, spriteKey, player, aim, flip, options = {})');
    expect(renderer).toContain('body.material.rotation = anim');
    expect(renderer).toContain('function syncPlayerDeathPool(anim, size, fallEase)');
  });

  test('renders network peers through the normal first- and third-person scene', () => {
    expect(renderer).toContain('function syncOtherPlayers()');
    expect(renderer).toContain('Neo.presentationPlayerSlots || []');
    expect(renderer).toContain('syncPool(\n    pools.players,');
    expect(renderer).toContain('syncOtherPlayers();');
    expect(renderer).toContain('otherPlayers: pools.players.size');
  });

  test('carries shared chaos, oak, and shop-card visuals into 3D', () => {
    expect(renderer).toContain("if (hazard.kind === 'chaos_burst') return makeChaosBurstObject();");
    expect(renderer).toContain('function updateChaosBurst(hazard, group)');
    expect(renderer).toContain("const texture = getEnvTileTexture(wooden ? 'barrel_oak' : 'wall_block');");
    expect(renderer).toContain('function getShopOfferTexture(offer, state)');
  });

  test('keeps 2D spawn, status, dash, and rock feedback visible in 3D', () => {
    expect(renderer).toContain('function syncSpawnPortals()');
    expect(renderer).toContain("group.visible = Number(enemy.spawnT || 0) <= 0;");
    expect(renderer).toContain('function syncActorStatus(group, actor, radius, isPlayer = false)');
    expect(renderer).toContain('Neo.drawStatusIconBadge(statusKey, count, 1, 1);');
    expect(renderer).toContain('function syncPlayerDashTrail(player, spriteKey, flip)');
    expect(renderer).toContain("new Set(['sarges_hammer', 'death_ball', 'rock'])");
    expect(renderer).toContain('const cacheKey = `${kind}|${visual.color || \'\'}`;');
  });

  test('renders live combat beam paths instead of a fixed visual-only beam', () => {
    expect(renderer).toContain('function getPlayerBeamVisual(effect = null)');
    expect(renderer).toContain('Neo.activePlayerEffects');
    expect(renderer).toContain('Neo.activeBeamPaths');
    expect(renderer).toContain("color: '#cda8ff'");
    expect(renderer).toContain('Neo.getPlayerBeamRange?.(mode, move)');
    expect(renderer).toContain('function getEnemyBeamVisual(enemy)');
    expect(renderer).toContain('Neo.getEnemyBeamBounceCount?.(enemy)');
  });

  test('keeps UI clicks out of first-person pointer lock and preserves the canvas input layer', () => {
    expect(renderer).toContain("document.addEventListener('pointerdown', requestGameplayPointerLock, true);");
    expect(renderer).toContain('let pointerLockRequested = false;');
    expect(renderer).toContain("document.addEventListener('mousemove', event => {");
    expect(renderer).toContain('}, true);');
    expect(renderer).toContain('function clearPointerLockPending()');
    expect(renderer).toContain('[data-no-pointer-lock]');
    expect(renderer).toContain('function isActuallyVisible(element)');
    expect(renderer).toContain("element.closest('.hidden, [aria-hidden=\"true\"]')");
    expect(renderer).toContain('function hasPointerLockBlockingUi()');
    expect(renderer).toContain('POINTER_LOCK_UI_SELECTORS');
    expect(styles).toMatch(/#c3d\s*\{[\s\S]*?pointer-events:\s*none;/);
  });

  test('keeps shared ragdolls, melee telegraphs, and Zip Lightning bursts in 3D', () => {
    expect(renderer).toContain('function syncPlayerMeleeIndicator()');
    expect(renderer).toContain('function makeMeleeIndicator()');
    expect(renderer).toContain('if (particle.ring && sprite.isMesh)');
    expect(renderer).toContain("mesh.name = 'corpse';");
    expect(renderer).toContain('Number(body.angularOffset || 0)');
    expect(renderer).toContain('Neo.CHARACTER_SPRITE_SHEETS?.[spriteKey]');
  });

  test('uses authored healing, Blade Justice, Turtle Wave, and charge HUD visuals in 3D', () => {
    expect(renderer).toContain("if (hazard.kind === 'healing_zone') return makeHealingZoneObject();");
    expect(renderer).toContain('function updateHealingZone(hazard, group)');
    expect(renderer).toContain('function syncJusticeBlades()');
    expect(renderer).toContain('pools.justiceBlades');
    expect(renderer).toContain('function getJusticeBladeTexture()');
    expect(renderer).toContain('sprite.material.rotation = -Number(blade.angle || 0);');
    expect(renderer).toContain('turtleWave,');
    expect(renderer).toContain('playerBeam.width * 1.7 * wavePulse');
    expect(renderer).toContain('function drawChargeHud()');
    expect(renderer).toContain('Neo.drawHealingZoneChargeBar?.();');
    expect(renderer).toContain('Neo.drawDeathBallChargeBar?.();');
    expect(renderer).toContain('Neo.drawLoveBombChargeBar?.();');
    expect(renderer).toContain('Neo.drawNimrodStompChargeBar?.();');
    expect(renderer).toContain('Neo.drawGhostBallChargeBar?.();');
  });

  test('keeps authored room dressing, special encounter visuals, and enemy windups in 3D', () => {
    expect(renderer).toContain('Neo.drawRoomDecor();');
    expect(renderer).toContain('function syncWorldFxOverlay()');
    expect(renderer).toContain('Neo.drawGhostBalls?.();');
    expect(renderer).toContain('Neo.drawSkySwords?.();');
    expect(renderer).toContain('Neo.drawChallengeObelisk?.();');
    expect(renderer).toContain('function syncEnemyWindup(group, enemy)');
    expect(renderer).toContain('function syncMooggyAura(group, enemy)');
    expect(renderer).toContain('if (particle.line && sprite.isLine)');
    expect(renderer).toContain('if (particle.shockwave && sprite.isMesh)');
  });

  test('projects third-person mouse aim to the same 3D floor the player sees', () => {
    const update = fs.readFileSync(path.join(__dirname, '../js/core/update.js'), 'utf8');
    const math = fs.readFileSync(path.join(__dirname, '../js/core/math-utils.js'), 'utf8');
    expect(renderer).toContain('function projectCanvasMouseToWorld(canvasX, canvasY)');
    expect(renderer).toContain('mouseAimRay.setFromCamera(mouseAimNdc, camera);');
    expect(renderer).toContain('Neo.projectCanvasMouseToWorld = projectCanvasMouseToWorld;');
    expect(math).toContain('const perspectiveAim = Neo.projectCanvasMouseToWorld?.(clampedCanvasX, canvasY);');
    expect(update).toContain('Neo.updatePointerAimWorld();');
  });
});
