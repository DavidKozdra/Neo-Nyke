const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { NetworkGameView } = require('../js/rendering/NetworkGameView');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('character action presentation', () => {
  const entities = read('js/draw/entities.js');
  const viewport = read('js/draw/viewport.js');
  const particles = read('js/draw/hud.js');
  const world = read('js/game/world.js');
  const combat = read('js/game/combat.js');
  const enemies = read('js/game/enemies.js');
  const sharedEnemyBehavior = read('js/simulation/SharedEnemyBehaviorSystem.js');
  const networkView = read('js/rendering/NetworkGameView.js');
  const threeRenderer = read('js/draw/three-renderer.js');

  function loadEntityPresentationApi() {
    const Neo = {
      ATTACKS: { melee: { active: 0.17 } },
      CHARACTER_SPRITE_SHEETS: {},
      SPRITE_DEFS: {},
      SPRITE_ATLAS: { frames: {} },
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
      gameElapsedTime: 0,
    };
    const sandbox = {
      Neo,
      window: { NeoSettings: { getAccess: () => ({}) } },
      Math,
      Date,
      WeakMap,
      Map,
    };
    vm.runInNewContext(entities, sandbox);
    return Neo;
  }

  test('uses the same untinted authored body style for local and remote players', () => {
    const Neo = loadEntityPresentationApi();
    const base = {
      character: 'metao', inv: 0, stun: 0, dashTime: 0, swing: 0,
      mooggyZoomiesTime: 0, princessFlightTime: 0,
    };
    const local = Neo.getPlayerSpriteRenderOptions({ ...base, id: 'local' }, {
      actionState: { action: null, progress: null },
      seedKey: 'local',
    });
    const remote = Neo.getPlayerSpriteRenderOptions({ ...base, id: 'remote' }, {
      actionState: { action: null, progress: null },
      seedKey: 'remote',
    });

    expect(remote.tint).toBeNull();
    expect(remote.shadowColor).toBe('rgba(0,0,0,0.25)');
    expect(remote.shadowBlur).toBe(local.shadowBlur);
    expect(remote.alpha).toBe(local.alpha);
    expect(remote.animation.maxSpeed).toBe(local.animation.maxSpeed);
    expect(remote.armRecoilProgress).toBe(local.armRecoilProgress);
    expect(remote.animation.stepRate).toBe(local.animation.stepRate);
  });

  test('applies campaign concealment alpha to remote players', () => {
    const Neo = loadEntityPresentationApi();
    Neo.isPlayerHidden = () => true;
    const actor = {
      equipmentEffects: { el_bartos_cape: { time: 1 } },
      inv: 0, stun: 0, dashTime: 0, swing: 0,
    };

    expect(Neo.getPlayerSpriteRenderOptions(actor, {
      actionState: { action: null, progress: null },
    }).alpha).toBe(0.34);
  });

  test('uses one arm-recoil timeline for local and remote players', () => {
    const Neo = loadEntityPresentationApi();
    Neo.gameElapsedTime = 4.9;
    const actor = { armRecoilUntil: 5, armRecoilDuration: 0.2 };

    expect(Neo.getPlayerSpriteRenderOptions(actor, {
      actionState: { action: null, progress: null },
    }).armRecoilProgress).toBeCloseTo(0.5);
  });

  test('drives authored walk frames from the shared gameplay presentation clock', () => {
    const Neo = loadEntityPresentationApi();
    Neo.CHARACTER_SPRITE_SHEETS.metao = {
      animations: { walk: ['walk0', 'walk1'] },
      stepRate: 10,
    };
    Neo.SPRITE_ATLAS.frames = {
      metao: {},
      'metao:walk0': {},
      'metao:walk1': {},
    };
    const actor = { character: 'metao', vx: 228, vy: 0, animSeed: 0 };

    Neo.gameElapsedTime = 0;
    expect(Neo.getActorSpriteFrameKey('metao', actor)).toBe('metao:walk0');
    Neo.gameElapsedTime = 0.11;
    expect(Neo.getActorSpriteFrameKey('metao', actor)).toBe('metao:walk1');
  });

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

  test.each([
    ['D', 'd', 1, Math.PI],
    ['A', 'a', -1, 0],
  ])('multiplayer keeps its facing after releasing %s with the cursor on the opposite side', (
    code, key, direction, aimDirection,
  ) => {
    const Neo = loadEntityPresentationApi();
    const originalPerformance = globalThis.performance;
    let now = 1000;
    let sequence = 0;
    globalThis.performance = { now: () => now };
    try {
      const view = new NetworkGameView({
        session: { playerId: 'p1', status: 'running', sendInput: () => sequence++ }, neo: Neo,
      });
      view.active = true;
      view.aimDirection = aimDirection;
      const gameState = {
        tick: 20, floorNumber: 1,
        floorState: { width: 900, height: 700, wallThickness: 28 },
        players: { p1: {
          id: 'p1', roomId: 'r1', x: 450, y: 350, vx: 0, vy: 0,
          radius: 14, moveSpeed: 228, aimDirection,
        } },
      };
      view._onSnapshot({ playerId: 'p1', snapshotSequence: 0, gameState });
      const present = () => {
        view._syncCampaignPresentationEntities(view._renderedPlayers(now), {}, 'p1', gameState, 0.05);
        return Neo.getActorActionFacingDirection(Neo.player, null, aimDirection);
      };
      const event = { code: `Key${code}`, key, preventDefault() {} };
      view._onKey(event, true);
      now += 100;
      expect(present()).toBe(direction);
      view._onKey(event, false);
      now += 100;
      expect(present()).toBe(direction);
      expect(Neo.player.vx).toBe(0);

      // A later server correction may change position while the player is idle.
      const stopped = { ...view.localPredictedPlayer, vx: 0 };
      view._onSnapshot({
        playerId: 'p1', snapshotSequence: 1, lastAcknowledgedInput: sequence - 1,
        gameState: { ...gameState, tick: 24, players: { p1: { ...stopped, x: stopped.x - direction * 2 } } },
      });
      now += 100;
      expect(present()).toBe(direction);
      expect(Neo.getActorActionFacingDirection(Neo.player, 'beam', aimDirection)).toBe(-direction);
      expect(Neo.getActorActionFacingDirection({ ...Neo.player, swing: 0.1 }, null, aimDirection)).toBe(-direction);

      const reverse = { code: code === 'D' ? 'KeyA' : 'KeyD', key: code === 'D' ? 'a' : 'd', preventDefault() {} };
      view._onKey(reverse, true);
      now += 100;
      expect(present()).toBe(-direction);
      view._onKey(reverse, false);
      now += 100;
      expect(present()).toBe(-direction);
    } finally {
      globalThis.performance = originalPerformance;
    }
  });

  test('remote idle facing ignores backward interpolation corrections', () => {
    const Neo = loadEntityPresentationApi();
    const view = new NetworkGameView({ session: {}, neo: Neo });
    const player = { id: 'p2', roomId: 'r1', x: 450, y: 350, vx: 228, vy: 0, aimDirection: Math.PI };
    view._syncCampaignPresentationEntities({ p2: player }, {}, 'p1', { tick: 20 }, 1 / 60);
    const actor = view.presentationPlayerActors.get('p2');
    expect(Neo.getActorActionFacingDirection(actor, null, player.aimDirection)).toBe(1);
    for (let frame = 0; frame < 10; frame += 1) {
      view._syncCampaignPresentationEntities({ p2: { ...player, x: 450 - frame, vx: 0 } }, {}, 'p1', { tick: 21 }, 1 / 60);
      expect(Neo.getActorActionFacingDirection(actor, null, player.aimDirection)).toBe(1);
    }
  });

  test('Sarge hammer smash plays its authored frames at twice the standard speed', () => {
    expect(combat).toContain("characterKey === 'sarge' && smashMoveKey === 'hammer_smash'");
    expect(combat).toMatch(/const smashSpriteDuration[\s\S]+?\? 0\.3[\s\S]+?: 0\.6;/);
    expect(combat).toContain("startPlayerSpriteAction('smash', smashSpriteDuration)");
  });

  test('Anthony bite plays its dedicated eight-frame action for players and bosses', () => {
    const Neo = loadEntityPresentationApi();
    Neo.CHARACTER_SPRITE_SHEETS.antony_blemmye = {
      animations: { bite: Array.from({ length: 8 }, (_, index) => `bite${index}`) },
      actionRate: 10,
    };
    Neo.SPRITE_ATLAS.frames = {
      antony_blemmye: {},
      ...Object.fromEntries(Array.from(
        { length: 8 },
        (_, index) => [`antony_blemmye:bite${index}`, {}],
      )),
    };

    Neo.gameElapsedTime = 4.4;
    const player = {
      spriteAction: 'bite',
      spriteActionStartedAt: 4,
      spriteActionUntil: 4.8,
    };
    expect(Neo.getActorSpriteFrameKey('antony_blemmye', player)).toBe('antony_blemmye:bite4');

    const boss = { type: 'antony_blemmye', biteAnimT: 0.4 };
    const bossAction = Neo.getEnemySpriteActionOptions(boss);
    expect(bossAction.action).toBe('bite');
    expect(bossAction.actionProgress).toBeCloseTo(0.5);
    expect(Neo.getActorSpriteFrameKey('antony_blemmye', boss, bossAction)).toBe('antony_blemmye:bite4');

    expect(combat).toContain("startPlayerSpriteAction('bite', 0.8)");
    expect(enemies).toContain('enemy.biteAnimT = 0.8');
    expect(sharedEnemyBehavior).toContain('enemy.biteAnimT = 0.8');
    expect(networkView).toContain("player.actionKind === 'antony_bite'");
  });

  test('Anthony resumes his walk cycle while moving after an attack finishes', () => {
    const Neo = loadEntityPresentationApi();
    Neo.CHARACTER_SPRITE_SHEETS.antony_blemmye = {
      animations: {
        idle: ['idle0', 'idle1'],
        walk: ['walk0', 'walk1', 'walk2', 'walk3'],
        attack: ['attack0', 'attack1', 'attack2', 'attack3', 'attack4'],
      },
      stepRate: 10,
    };
    Neo.SPRITE_ATLAS.frames = Object.fromEntries([
      ['antony_blemmye', {}],
      ...Array.from({ length: 4 }, (_, index) => [`antony_blemmye:walk${index}`, {}]),
      ...Array.from({ length: 5 }, (_, index) => [`antony_blemmye:attack${index}`, {}]),
    ]);
    const boss = { type: 'antony_blemmye', vx: 70, vy: 0, animSeed: 0 };

    Neo.gameElapsedTime = 0.11;
    expect(Neo.getActorSpriteFrameKey('antony_blemmye', boss, { attackProgress: 0.5 }))
      .toBe('antony_blemmye:attack2');
    expect(Neo.getActorSpriteFrameKey('antony_blemmye', boss, { attackProgress: 0 }))
      .toBe('antony_blemmye:walk1');

    expect(enemies).toContain('enemy.swingTime = Math.max(0, Number(enemy.swingTime || 0) - dt)');
    expect(sharedEnemyBehavior).toContain('enemy.swingTime = Math.max(0, Number(enemy.swingTime || 0) - dt)');
    expect(sharedEnemyBehavior).toContain('enemy.attackAnimT = Math.max(0, Number(enemy.attackAnimT || 0) - dt)');
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
