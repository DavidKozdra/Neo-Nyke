const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeMovement,
  computeWorldTransform,
  computeCameraTransform,
  interpolatePlayers,
  predictPosition,
  deriveAbilityPresentation,
  NetworkGameView,
} = require('../js/rendering/NetworkGameView');
const { LOCAL_BUILD_VERSION, LOCAL_CONTENT_HASH } = require('../js/multiplayer/LocalMultiplayerSession');

describe('network multiplayer game view', () => {
  test('uses a floor-renderer compatibility identity so stale movement clients cannot join', () => {
    expect(LOCAL_BUILD_VERSION).toBe('1.0.0-campaign-parity-v15');
    expect(LOCAL_CONTENT_HASH).toBe('shared-neo-campaign-parity-v15');
  });

  test('normalizes diagonal keyboard/gamepad movement', () => {
    const movement = normalizeMovement(1, 1);
    expect(Math.hypot(movement.moveX, movement.moveY)).toBeCloseTo(1);
    expect(normalizeMovement(0.5, 0)).toEqual({ moveX: 0.5, moveY: 0 });
  });

  test('maps network movement and aim to the first-person camera direction', () => {
    const sent = [];
    const neo = { getFirstPersonYaw: () => 0 };
    const session = {
      snapshot: () => ({ status: 'running' }),
      sendInput: input => sent.push(input),
    };
    const view = new NetworkGameView({ session, neo });
    view.active = true;
    view.keys.add('KeyW');
    expect(view._readMovement()).toEqual({ moveX: 1, moveY: 0 });
    view.localPredictedPlayer = { id: 'p1', x: 100, y: 100, radius: 18, moveSpeed: 180 };
    view._sendInput();
    expect(sent).toEqual([expect.objectContaining({ moveX: 1, moveY: 0, aimDirection: 0 })]);
  });

  test('fits the authority room into the Neo Nyke canvas', () => {
    expect(computeWorldTransform(960, 640, 900, 700)).toEqual({
      scale: 640 / 700,
      offsetX: (960 - 900 * (640 / 700)) / 2,
      offsetY: 0,
      roomWidth: 900,
      roomHeight: 700,
    });
    const croppedViewport = computeWorldTransform(960, 640, 900, 700, {
      left: 0,
      top: 50,
      right: 960,
      bottom: 590,
    });
    expect(croppedViewport.scale).toBeCloseTo(540 / 700);
    expect(croppedViewport.offsetY).toBe(50);
    expect(croppedViewport.offsetX).toBeCloseTo((960 - 900 * (540 / 700)) / 2);
  });

  test('uses the same unscaled camera translation as the campaign renderer', () => {
    expect(computeCameraTransform(960, 640, { x: -30, y: 30 })).toEqual({
      scale: 1,
      offsetX: 30,
      offsetY: -30,
      roomWidth: 960,
      roomHeight: 640,
    });
  });

  test('interpolates remote players and bounds local prediction inside walls', () => {
    const players = interpolatePlayers(
      { p1: { id: 'p1', x: 100, y: 200 } },
      { p1: { id: 'p1', x: 200, y: 300 } },
      0.5,
    );
    expect(players.p1).toEqual({ id: 'p1', x: 150, y: 250 });
    expect(interpolatePlayers(
      { p1: { id: 'p1', roomId: 'room-a', x: 850, y: 350 } },
      { p1: { id: 'p1', roomId: 'room-b', x: 64, y: 350 } },
      0.5,
    ).p1).toEqual({ id: 'p1', roomId: 'room-b', x: 64, y: 350 });

    const predicted = predictPosition(
      { id: 'p1', x: 50, y: 50, radius: 18, moveSpeed: 180 },
      { moveX: -1, moveY: -1, aimDirection: 1 },
      1,
      { width: 900, height: 700, wallThickness: 28 },
    );
    expect(predicted.x).toBe(46);
    expect(predicted.y).toBe(46);
    expect(predicted.aimDirection).toBe(1);
  });

  test('adapts authoritative chests and stairs into the campaign render entities', () => {
    const neo = {};
    const view = new NetworkGameView({ session: {}, neo });
    const floorState = {
      currentRoomId: 'treasure-room',
      visitedRoomIds: ['treasure-room'],
      rewards: { 'treasure-room': { status: 'claimed' } },
      layout: { floorNumber: 2, rooms: [{ id: 'treasure-room', type: 'treasure' }] },
    };
    view._syncNeoPresentationFloor(floorState, {}, {}, {
      floorSeed: 'floor-2',
      interactables: {
        chest: { id: 'chest', kind: 'relic_chest', roomId: 'treasure-room', x: 300, y: 280, activated: true },
        stairs: { id: 'stairs', kind: 'stairs', roomId: 'treasure-room', x: 450, y: 350 },
      },
    });

    expect(neo.chests).toEqual([expect.objectContaining({ id: 'chest', x: 300, y: 280, open: true })]);
    expect(neo.pickups).toContainEqual(expect.objectContaining({ id: 'stairs', type: 'ladder', networkExit: true }));
    expect(neo.currentRoom.cleared).toBe(true);
  });

  test('adapts server-owned persistent abilities into campaign hazards', () => {
    const neo = {};
    const view = new NetworkGameView({ session: {}, neo });
    const floorState = {
      currentRoomId: 'room-a', visitedRoomIds: ['room-a'],
      layout: { floorNumber: 1, rooms: [{ id: 'room-a', type: 'combat' }] },
    };
    view._syncNeoPresentationFloor(floorState, {}, {}, {
      tick: 20,
      interactables: {},
      abilityEntities: {
        zone: {
          id: 'zone', kind: 'healing_zone', roomId: 'room-a', x: 320, y: 280,
          radius: 130, expiresTick: 80,
        },
        remote: { id: 'remote', kind: 'fire_circle', roomId: 'room-b', x: 1, y: 1, radius: 100, expiresTick: 80 },
      },
    });

    expect(neo.hazards).toEqual([
      expect.objectContaining({ id: 'zone', kind: 'healing_zone', x: 320, y: 280, r: 130, ttl: 3 }),
    ]);
  });

  test('renders authoritative beams through the campaign laser renderer and restores its globals', () => {
    const draws = [];
    const originalPlayer = { id: 'campaign-player' };
    const neo = {
      player: originalPlayer,
      laserActive: false,
      laserMode: 'beam',
      drawPlayerLaser() {
        expect(typeof this.rng).toBe('function');
        draws.push({ player: this.player, active: this.laserActive, mode: this.laserMode, angle: this.laserAngle });
      },
    };
    const actor = { id: 'p1', equippedMoves: { laser: 'turtle_wave' }, items: {} };
    const view = new NetworkGameView({ session: {}, neo });
    view.presentationPlayerSlots = [{ id: 'p1', getEntity: () => actor, getDead: () => false }];
    view.combatEffects = [{
      eventType: 'PLAYER_ABILITY_USED',
      startedAt: performance.now() - 100,
      data: { playerId: 'p1', abilityId: 'turtle_wave', aimDirection: 1.25 },
    }];

    view.drawAuthoritativePlayerEffects();

    expect(draws).toEqual([expect.objectContaining({ player: actor, active: true, mode: 'turtle_wave', angle: 1.25 })]);
    expect(neo.player).toBe(originalPlayer);
    expect(neo.laserActive).toBe(false);
    expect(neo.rng).toBeUndefined();
  });

  test('restores single-player presentation state after leaving a network match', () => {
    const originalPlayer = { id: 'single-player' };
    const originalEnemies = [{ id: 'campaign-enemy' }];
    const neo = { player: originalPlayer, enemies: originalEnemies };
    const view = new NetworkGameView({ session: {}, neo });
    view._captureCampaignPresentationState();
    neo.player = { id: 'network-player' };
    neo.enemies = [{ id: 'network-enemy' }];
    neo.hazards = [{ id: 'network-hazard' }];

    view._restoreCampaignPresentationState();

    expect(neo.player).toBe(originalPlayer);
    expect(neo.enemies).toBe(originalEnemies);
    expect(neo).not.toHaveProperty('hazards');
  });

  test('adapts server upgrade offers into campaign dwell-choice pickups', () => {
    const sent = [];
    const session = {
      snapshot: () => ({ playerId: 'p1' }),
      sendUpgrade: (...args) => sent.push(args),
    };
    const view = new NetworkGameView({ session, neo: { AB_CHEST_DWELL_SECONDS: 2.2, AB_CHEST_DWELL_RADIUS: 44 } });
    const state = {
      players: {
        p1: {
          pendingUpgrade: {
            selectionEventId: 'chest-1', sourceEntityId: 'chest-1',
            options: [
              { id: 'iron_heart', name: 'Iron Heart', description: '+25 max HP', rarity: 'knight' },
              { id: 'war_sigil', name: 'War Sigil', description: '+20% damage', rarity: 'knight' },
            ],
          },
        },
      },
      interactables: { 'chest-1': { id: 'chest-1', roomId: 'treasure', x: 450, y: 300 } },
    };

    const choices = view._upgradePresentationPickups(state);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toEqual(expect.objectContaining({ type: 'rewardChoice', dwellMode: true, itemPresentation: expect.objectContaining({ name: 'Iron Heart' }) }));
    view._updateUpgradeDwell({ x: choices[0].x, y: choices[0].y }, state, 2.2);
    expect(sent).toEqual([['chest-1', 'iron_heart']]);
  });

  test('uses campaign-authored ability presentation from the authority event', () => {
    expect(deriveAbilityPresentation({ presentationKey: 'crimson_smash', slot: 'smash' })).toEqual(expect.objectContaining({
      kind: 'aoe', color: '#ff3048', style: 'heavy', sound: 'aoe',
    }));
    expect(deriveAbilityPresentation({ presentationKey: 'healing_zone', mode: 'support' })).toEqual(expect.objectContaining({
      kind: 'support', color: '#35ff6f', style: 'light', sound: 'aoe',
    }));
  });

  test('replays an accepted AOE through the campaign effect hooks at server coordinates', () => {
    const calls = [];
    const neo = {
      spawnAoeShockwave: (...args) => calls.push(['shockwave', ...args]),
      ringBurst: (...args) => calls.push(['ring', ...args]),
      addTrauma: (...args) => calls.push(['trauma', ...args]),
      addHitstop: (...args) => calls.push(['hitstop', ...args]),
    };
    const view = new NetworkGameView({ session: {}, neo });
    view.currentSample = { state: { players: { p1: { id: 'p1', x: 700, y: 600 } } } };

    view._spawnGameplayEventEffect({
      eventType: 'PLAYER_ABILITY_USED',
      data: {
        playerId: 'p1', abilityId: 'crimson_smash', presentationKey: 'crimson_smash',
        presentation: { key: 'crimson_smash', kind: 'aoe', style: 'heavy' },
        originX: 240, originY: 310, effectRadius: 140,
      },
    });

    expect(calls).toContainEqual(['shockwave', 240, 310, 140, '#ff3048', 'heavy']);
    expect(calls).toContainEqual(['ring', 240, 310, 116, '#ff3048', 0.44]);
  });

  test('replays authority-owned persistent pulses without simulating their hits', () => {
    const calls = [];
    const neo = {
      ringBurst: (...args) => calls.push(['ring', ...args]),
      spawnAoeShockwave: (...args) => calls.push(['shockwave', ...args]),
    };
    const view = new NetworkGameView({ session: {}, neo });
    view.currentSample = { state: { players: { p1: { id: 'p1', x: 0, y: 0 } } } };

    view._spawnGameplayEventEffect({
      eventType: 'ABILITY_ENTITY_PULSED',
      data: { playerId: 'p1', presentationKey: 'holy_turrets', x: 440, y: 260, radius: 56 },
    });

    expect(calls).toContainEqual(['ring', 440, 260, 30.800000000000004, '#fff1b0', 0.32]);
    expect(calls).toContainEqual(['shockwave', 440, 260, 56, '#fff1b0', 'light']);
  });

  test('sends combat commands without locally puppeting the player', () => {
    const sent = [];
    const session = {
      snapshot: () => ({ status: 'running' }),
      sendAction: (...args) => sent.push(['action', ...args]),
      sendAbility: (...args) => sent.push(['ability', ...args]),
    };
    const view = new NetworkGameView({ session, neo: {} });
    view.active = true;
    view.localPredictedPlayer = {
      action: 'idle',
      equippedMoves: { smash: 'crimson_smash' },
    };
    view.aimDirection = 1.25;

    view._attack();
    view._useSlot('smash');

    expect(sent).toEqual([
      ['action', 'ATTACK', 1.25],
      ['ability', 'crimson_smash', 1.25],
    ]);
    expect(view.localPredictedPlayer).toEqual({
      action: 'idle',
      equippedMoves: { smash: 'crimson_smash' },
    });
  });

  test('runtime uses campaign world, beam, and HUD presentation for multiplayer', () => {
    const root = path.join(__dirname, '..');
    const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
    const environment = fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8');
    expect(main).toContain("import './rendering/NetworkGameView.js'");
    expect(environment).toContain('Neo.multiplayerGameView.syncPresentation();');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('requestAnimationFrame?.(this.boundRenderFrame)');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('_syncNeoPresentationFloor(floorState, enemies, pickups, state)');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('_syncCampaignPresentationEntities(visiblePlayers, projectiles, localPlayerId, state)');
    expect(fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8')).toContain('Neo.threeRenderer?.render?.()');
    expect(fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8')).toContain('Neo.drawWorldViewport(Neo.camera');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.decorateRoomData(room)');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.updateHud?.()');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('this.neo.uiController?.setHudValues');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('_drawAbilityEffects');
    expect(fs.readFileSync(path.join(root, 'js/draw/viewport.js'), 'utf8')).toContain('drawAuthoritativePlayerEffects?.()');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain("ctx.font = '700 16px VT323, monospace'");
    expect(fs.readFileSync(path.join(root, 'js/draw/viewport.js'), 'utf8')).toContain('getPresentationPlayerSlots?.()');
  });
});
