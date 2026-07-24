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

  test('uses actual health loss instead of dash invulnerability for the red damage flash', () => {
    expect(renderer).toContain('const actorDamageFeedback = new WeakMap();');
    expect(renderer).toContain('if (hp < feedback.hp)');
    expect(renderer).toContain('isActorDamageFlashActive(p) ? 0xff9999 : 0xffffff');
    expect(renderer).toContain('isActorDamageFlashActive(actor) ? 0xff9999 : 0xffffff');
    expect(renderer).not.toMatch(/p\.inv > 0[^\n]*0xff9999/);
    expect(renderer).not.toMatch(/actor\.inv > 0[^\n]*0xff9999/);
  });

  test('renders network peers through the normal first- and third-person scene', () => {
    expect(renderer).toContain('function syncOtherPlayers()');
    expect(renderer).toContain('const projectedSlots = Neo.presentationPlayerSlots;');
    expect(renderer).toContain('Neo.getActivePlayerSlots?.() || []');
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
    expect(renderer).not.toContain('SHAPED_PROJECTILE_KINDS');
    expect(renderer).toContain("`${kind}|${visual.shape || ''}|${visual.color || ''}|${visual.core || ''}|${projectile.enemy ? 1 : 0}`");
    expect(renderer).toContain('function makeProjectileObject(projectile)');
    expect(renderer).toContain('new THREE.DodecahedronGeometry(1, 0)');
    expect(renderer).toContain('new THREE.CylinderGeometry(1, 1, 0.28, 18)');
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
    expect(renderer).toContain('function drawChargeHud(p = Neo.player, viewCamera = camera, viewport = null)');
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
    expect(renderer).toContain('function syncSkySwords()');
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
    expect(renderer).toContain('mouseAimRay.setFromCamera(mouseAimNdc, aimCamera);');
    expect(renderer).toContain('Neo.projectCanvasMouseToWorld = projectCanvasMouseToWorld;');
    expect(math).toContain('const perspectiveAim = Neo.projectCanvasMouseToWorld?.(clampedCanvasX, canvasY);');
    expect(update).toContain('Neo.updatePointerAimWorld();');
    expect(update).toContain('if (!Neo.render3D) Neo.updatePointerAimWorld?.();');
  });

  test('keeps interaction and actor-state feedback visible in 3D', () => {
    expect(renderer).toContain('Neo.drawJesterPortalPrompt');
    expect(renderer).toContain("barrier.name = 'overheal-barrier'");
    expect(renderer).toContain('function syncActorFeedback(group, actor, radius');
    expect(renderer).toContain("lostSight.name = 'lost-sight'");
    expect(renderer).toContain('!!actor?.playerLostSight');
  });

  test('retains destructible damage and broken art in 3D', () => {
    expect(renderer).toContain('function rasterizeDestructible2D');
    expect(renderer).toContain("statePlate.name = 'state-art'");
    expect(renderer).toContain('Math.sin(shakeRatio * Math.PI * 3)');
    expect(renderer).toContain('statePlate.position.y = prop.broken ? 2.2 : BLOCK_HEIGHT + 0.8;');
  });

  test('renders local split-screen and alternate modes through the 3D path', () => {
    const environment = fs.readFileSync(path.join(__dirname, '../js/draw/environment.js'), 'utf8');
    expect(environment).toContain('const worldDrawn3D = Neo.render3D && !!Neo.threeRenderer?.render?.();');
    expect(renderer).toContain('function renderSceneViews()');
    expect(renderer).toContain('renderer.setScissorTest(true);');
    expect(renderer).not.toContain("if (Neo.isSplitScreen?.()) return false;         // split-screen stays on the 2D path");
    expect(renderer).toContain("return Neo.SPRITE_DEFS?.[key] || Neo.CHARACTER_SPRITE_SHEETS?.[key] ? key : 'thorn_knight';");
  });

  test('restores extending-staff range preview in third person', () => {
    expect(renderer).toContain('function syncPlayerWeaponPreview()');
    expect(renderer).toContain("Neo.getEquippedWeapon?.() === 'extending_staff'");
    expect(renderer).toContain('const arcSize = 1.45;');
  });
});
