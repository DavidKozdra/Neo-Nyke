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
    expect(LOCAL_BUILD_VERSION).toBe('1.0.0-campaign-parity-v26');
    expect(LOCAL_CONTENT_HASH).toBe('shared-neo-campaign-parity-v26');
  });

  test('normalizes diagonal keyboard/gamepad movement', () => {
    const movement = normalizeMovement(1, 1);
    expect(Math.hypot(movement.moveX, movement.moveY)).toBeCloseTo(1);
    expect(normalizeMovement(0.5, 0)).toEqual({ moveX: 0.5, moveY: 0 });
  });

  test('predicts with the same status speed and responsive velocity used by authority', () => {
    const base = { id: 'p1', x: 450, y: 350, vx: 0, vy: 0, radius: 18, moveSpeed: 200, statuses: { slow: { stacks: 2 } } };
    const predicted = predictPosition(base, { moveX: 1, moveY: 0 }, 0.05, { width: 900, height: 700 }, 10);
    expect(predicted.vx).toBeGreaterThan(0);
    expect(predicted.vx).toBeLessThan(200);
    expect(predicted.x).toBeCloseTo(450 + predicted.vx * 0.05);
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

  describe('touch movement', () => {
    afterEach(() => { delete globalThis.NeoTouch; });

    function touchView() {
      const view = new NetworkGameView({ session: {}, neo: {} });
      view.active = true;
      return view;
    }

    test('reads the on-screen joystick so mobile can move in a network run', () => {
      globalThis.NeoTouch = { active: true, moveX: 1, moveY: 0 };
      expect(touchView()._readMovement()).toEqual({ moveX: 1, moveY: 0 });
    });

    test('applies a deadzone to resting-thumb drift', () => {
      globalThis.NeoTouch = { active: true, moveX: 0.05, moveY: -0.04 };
      expect(touchView()._readMovement()).toEqual({ moveX: 0, moveY: 0 });
    });

    test('ignores the stick while touch controls are inactive', () => {
      globalThis.NeoTouch = { active: false, moveX: 1, moveY: 1 };
      expect(touchView()._readMovement()).toEqual({ moveX: 0, moveY: 0 });
    });

    test('keeps working when NeoTouch is absent entirely', () => {
      const view = touchView();
      view.keys.add('KeyW');
      // No getFirstPersonYaw on this neo stub, so the vector stays unrotated:
      // KeyW is world-up, i.e. negative Y.
      expect(view._readMovement()).toEqual({ moveX: 0, moveY: -1 });
    });

    test('diagonal touch input is normalized like keyboard diagonals', () => {
      globalThis.NeoTouch = { active: true, moveX: 1, moveY: 1 };
      const movement = touchView()._readMovement();
      expect(Math.hypot(movement.moveX, movement.moveY)).toBeCloseTo(1);
    });
  });

  test('enters campaign play presentation without advancing a second browser simulation', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/core/update.js'), 'utf8');
    const states = [];
    const view = new NetworkGameView({
      session: { subscribe: () => () => {}, snapshot: () => ({}) },
      neo: {
        canvas: {}, ctx: {}, gameState: 'menu', loopStarted: true,
        setGameState: state => states.push(state),
      },
      canvas: {}, context: {}, document: { getElementById: () => null, addEventListener: () => {} },
    });
    view.start();
    expect(states).toContain('play');
    expect(source).toContain('!Neo.multiplayerGameView?.active');
    view.stop();
  });

  test('leaves Escape entirely to the campaign pause and panel handler', () => {
    const preventDefault = jest.fn();
    const pauseGame = jest.fn();
    const view = new NetworkGameView({ session: {}, neo: { gameState: 'play', pauseGame } });
    view.active = true;

    view._onKey({ code: 'Escape', preventDefault }, true);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(pauseGame).not.toHaveBeenCalled();
    expect(view.paused).toBe(false);
  });

  // The shop/anvil/special-room panels are toggled by the campaign's global
  // keydown handler (panels.js), which runs in multiplayer too. _interact used to
  // toggle them as well, so one E press fired both listeners — open then instantly
  // close, the shop panel "flickering off right away".
  test('does not toggle the shop panel itself — that is the campaign handler\'s job', () => {
    const toggleShopPanel = jest.fn();
    const toggleAnvilPanel = jest.fn();
    const toggleSpecialRoomPanel = jest.fn();
    const sendInteract = jest.fn();
    const view = new NetworkGameView({
      session: {
        snapshot: () => ({ playerId: 'p1' }),
        sendInteract,
      },
      neo: {
        currentRoom: { type: 'shop' },
        toggleShopPanel,
        toggleAnvilPanel,
        toggleSpecialRoomPanel,
        isSpecialRoom: () => false,
      },
    });
    view.active = true;
    view.currentSample = { state: { players: { p1: { x: 450, y: 350, radius: 18 } }, interactables: {} } };

    view._interact();

    expect(toggleShopPanel).not.toHaveBeenCalled();
    expect(toggleAnvilPanel).not.toHaveBeenCalled();
    expect(toggleSpecialRoomPanel).not.toHaveBeenCalled();
  });

  test('still sends an INTERACT command for a nearby chest — the one job the campaign handler cannot do', () => {
    const sendInteract = jest.fn();
    const view = new NetworkGameView({
      session: { snapshot: () => ({ playerId: 'p1' }), sendInteract },
      neo: { currentRoom: { type: 'combat' }, isSpecialRoom: () => false },
    });
    view.active = true;
    view.currentSample = {
      state: {
        players: { p1: { x: 450, y: 350, radius: 18, roomId: 'r1' } },
        interactables: {
          chest1: { id: 'chest1', x: 455, y: 352, radius: 20, roomId: 'r1', opened: false },
        },
      },
    };

    view._interact();

    expect(sendInteract).toHaveBeenCalledWith('chest1');
  });

  test('sends lasers along campaign FPS yaw instead of overwriting aim with a top-down click angle', () => {
    const sent = [];
    const canvas = {
      width: 960,
      height: 640,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
    };
    const updatePointerAimWorld = jest.fn(() => 1.75);
    const view = new NetworkGameView({
      canvas,
      neo: { updatePointerAimWorld },
      session: {
        snapshot: () => ({ status: 'running' }),
        sendAbility: (...args) => sent.push(args),
      },
    });
    view.active = true;
    view.localPredictedPlayer = {
      x: 450,
      y: 350,
      equippedMoves: { laser: 'blood_beam' },
    };

    view._onPointerDown({
      button: 2,
      target: canvas,
      clientX: 900,
      clientY: 40,
      preventDefault: jest.fn(),
    });

    expect(view.aimDirection).toBe(1.75);
    expect(sent).toEqual([['blood_beam', 1.75]]);
    expect(updatePointerAimWorld).toHaveBeenCalledWith(expect.objectContaining({
      canvasX: 900,
      canvasY: 40,
      player: view.localPredictedPlayer,
    }));
  });

  test('uses the campaign third-person floor projection for network laser aim', () => {
    const canvas = {
      width: 960,
      height: 640,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 320 }),
    };
    const updatePointerAimWorld = jest.fn(() => Math.PI / 2);
    const view = new NetworkGameView({
      canvas,
      neo: { updatePointerAimWorld },
      session: {},
    });
    view.active = true;
    view.localPredictedPlayer = { x: 100, y: 100 };

    view._onPointerMove({ clientX: 250, clientY: 180 });

    expect(updatePointerAimWorld).toHaveBeenCalledWith(expect.objectContaining({ canvasX: 480, canvasY: 320 }));
    expect(view.aimDirection).toBeCloseTo(Math.PI / 2);
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

  // The protocol never sends vx/vy, but every movement animation in
  // drawActorSprite is gated on hypot(vx, vy). Without a derived velocity,
  // networked heroes slide across the floor in a permanent idle pose.
  describe('derives networked player velocity from interpolated position deltas', () => {
    const step = (view, actor, x, y, frameDelta) => {
      const derived = view._deriveActorVelocity(actor, { x, y }, frameDelta);
      return { x, y, ...derived };
    };

    test('converges on the authoritative move speed and decays back to idle', () => {
      const view = new NetworkGameView({ session: {}, neo: {} });
      const frameDelta = 1 / 60;
      // Walk right at the authority's 228px/s (CampaignSimulation moveSpeed).
      let actor = { x: 100, y: 100, vx: 0, vy: 0 };
      for (let frame = 0; frame < 60; frame += 1) {
        actor = step(view, actor, actor.x + 228 * frameDelta, 100, frameDelta);
      }
      expect(Math.hypot(actor.vx, actor.vy)).toBeCloseTo(228, 0);

      // Standing still has to fall back under the `moving` threshold of 8px/s,
      // or the walk cycle would keep animating in place.
      for (let frame = 0; frame < 30; frame += 1) actor = step(view, actor, actor.x, 100, frameDelta);
      expect(Math.hypot(actor.vx, actor.vy)).toBeLessThan(8);
    });

    test('is framerate independent', () => {
      const view = new NetworkGameView({ session: {}, neo: {} });
      const settle = fps => {
        let actor = { x: 0, y: 0, vx: 0, vy: 0 };
        for (let frame = 0; frame < fps; frame += 1) actor = step(view, actor, actor.x + 228 / fps, 0, 1 / fps);
        return Math.hypot(actor.vx, actor.vy);
      };
      expect(settle(144)).toBeCloseTo(settle(60), 0);
    });

    test('ignores teleports so room changes do not spike into a sprint', () => {
      const view = new NetworkGameView({ session: {}, neo: {} });
      expect(view._deriveActorVelocity({ x: 100, y: 100, vx: 50, vy: 0 }, { x: 800, y: 600 }, 1 / 60))
        .toEqual({ vx: 0, vy: 0 });
    });

    test('holds the last velocity when a frame reports no elapsed time', () => {
      const view = new NetworkGameView({ session: {}, neo: {} });
      expect(view._deriveActorVelocity({ x: 10, y: 10, vx: 42, vy: -7 }, { x: 12, y: 10 }, 0))
        .toEqual({ vx: 42, vy: -7 });
    });
  });

  // These render fields used to be derived only for the local player, so
  // teammates never showed that they were burning, poisoned or dashing.
  test('derives status, dash and flight render fields for remote players too', () => {
    const neo = {};
    const view = new NetworkGameView({ session: { snapshot: () => ({ playerId: 'p1' }) }, neo });
    const burning = { fire: { stacks: 3, duration: 2, tick: 0 } };
    view._syncCampaignPresentationEntities({
      p1: { id: 'p1', x: 10, y: 10, action: 'idle' },
      p2: {
        id: 'p2', x: 50, y: 50, action: 'dash', actionTick: 100,
        statuses: burning, statusUntilTick: { flying_unhitable: 140 },
      },
    }, {}, 'p1', { tick: 100 }, 1 / 60);

    const remote = view.presentationPlayerSlots.find(slot => slot.id === 'p2').getEntity();
    expect(remote.statuses).toEqual(burning);
    expect(remote.dashTime).toBe(0.2);
    expect(remote.princessFlightTime).toBeCloseTo(2);

    // The local hero keeps the values the HUD block used to set by hand.
    const local = view.presentationPlayerSlots.find(slot => slot.id === 'p1').getEntity();
    expect(local.dashTime).toBe(0);
    expect(local.princessFlightTime).toBe(0);
    // A player the authority sent no statuses for still gets a zeroed map, so
    // drawPlayer's getStatusStacks reads never hit an undefined.
    expect(Object.values(local.statuses).every(state => state.stacks === 0)).toBe(true);
  });

  test('projects authority-owned shop stock into the normal campaign shop UI state', () => {
    const neo = {};
    const view = new NetworkGameView({ session: {}, neo });
    const offers = [
      { id: 'shop:item:0', type: 'item', key: 'neo_knife', cost: 36, bought: false },
      { id: 'shop:potion', type: 'potion', cost: 20, bought: false },
    ];
    const floorState = {
      currentRoomId: 'shop-room',
      visitedRoomIds: ['shop-room'],
      layout: { floorNumber: 1, rooms: [{ id: 'shop-room', type: 'shop', shopOffers: offers }] },
    };

    view._syncNeoPresentationFloor(floorState, {}, {}, { interactables: {}, abilityEntities: {} });

    expect(neo.currentRoom.type).toBe('shop');
    expect(neo.shopOffers).toEqual(offers);
    expect(neo.currentRoom.shopOffers).toEqual(offers);
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
    const firstZone = neo.hazards[0];
    view._syncNeoPresentationFloor(floorState, {}, {}, {
      tick: 21,
      interactables: {},
      abilityEntities: {
        zone: { id: 'zone', kind: 'healing_zone', roomId: 'room-a', x: 325, y: 280, radius: 130, expiresTick: 80 },
      },
    });
    expect(neo.hazards[0]).toBe(firstZone);
    expect(firstZone.x).toBe(325);
  });

  test('keeps enemies and projectiles stable for normal renderer animation pools', () => {
    const neo = { ensureStatuses: jest.fn() };
    const view = new NetworkGameView({ session: {}, neo });
    const floorState = {
      currentRoomId: 'room-a', visitedRoomIds: ['room-a'],
      layout: { floorNumber: 1, rooms: [{ id: 'room-a', type: 'combat' }] },
    };
    const enemy = { id: 'e1', roomId: 'room-a', x: 20, y: 30, health: 50, maxHealth: 50, radius: 18 };
    view._syncNeoPresentationFloor(floorState, { e1: enemy }, {}, { tick: 1, interactables: {}, abilityEntities: {} });
    view._syncCampaignPresentationEntities({}, { shot: { id: 'shot', x: 1, y: 2, radius: 4, expiresTick: 20 } }, '', { tick: 1 });
    const firstEnemy = neo.enemies[0];
    const firstProjectile = neo.projectiles[0];

    enemy.x = 25;
    view._syncNeoPresentationFloor(floorState, { e1: enemy }, {}, { tick: 2, interactables: {}, abilityEntities: {} });
    view._syncCampaignPresentationEntities({}, { shot: { id: 'shot', x: 3, y: 2, radius: 4, expiresTick: 20 } }, '', { tick: 2 });

    expect(neo.enemies[0]).toBe(firstEnemy);
    expect(firstEnemy.x).toBe(25);
    expect(neo.projectiles[0]).toBe(firstProjectile);
    expect(firstProjectile.x).toBe(3);
  });

  test('projects authoritative beam channels as ordinary client presentation effects', () => {
    const neo = {};
    // The authority's live channel state drives the beam — angle updates every
    // tick as the caster steers, instead of freezing at the cast direction.
    const actor = {
      id: 'p1', equippedMoves: { laser: 'turtle_wave' }, items: {},
      beamChannel: { moveKey: 'turtle_wave', angle: 1.25, startTick: 40, untilTick: 67, sweepDirection: 0 },
    };
    const view = new NetworkGameView({ session: {}, neo });
    view.currentSample = { tick: 45, state: { tick: 45 } };
    view.presentationPlayerSlots = [{ id: 'p1', getEntity: () => actor, getDead: () => false }];

    const effects = view._projectActivePlayerEffects();

    expect(effects).toEqual([expect.objectContaining({
      player: actor,
      laserActive: true,
      laserMode: 'turtle_wave',
      laserAngle: 1.25,
      laserTime: (67 - 45) / 20,
    })]);
  });

  test('projects authored Blade Justice, Titan Hammer, and Excalibur visuals', () => {
    const neo = { projectiles: [] };
    const actor = { id: 'p1', x: 300, y: 350, aimDirection: 0 };
    const view = new NetworkGameView({ session: {}, neo });
    view.presentationPlayerSlots = [{ id: 'p1', getEntity: () => actor, getDead: () => false }];
    const now = performance.now();
    view.combatEffects = [
      { eventId: 'blade-event', eventType: 'PLAYER_ABILITY_USED', startedAt: now - 200, data: { playerId: 'p1', abilityId: 'blade_justice', aimDirection: 0 } },
      { eventId: 'hammer-event', eventType: 'PLAYER_ABILITY_USED', startedAt: now - 200, data: { playerId: 'p1', abilityId: 'titan_hammer', aimDirection: 0, effectRadius: 120 } },
      { eventId: 'sword-event', eventType: 'PLAYER_ABILITY_USED', startedAt: now - 200, data: { playerId: 'p1', abilityId: 'excalibur_strike', aimDirection: 0, originX: 400, originY: 350 } },
    ];

    view._syncSpecialMovePresentation(now);

    expect(neo.justiceBlades).toHaveLength(3);
    expect(neo.titanHammer).toEqual(expect.objectContaining({ ownerId: 'p1', x: 420, y: 350 }));
    expect(neo.skySwords).toHaveLength(5);
    expect(neo.skySwords[0]).toEqual(expect.objectContaining({ x: 400, y: 350 }));
  });

  test('preserves the shared enemy spawn window from authority ticks', () => {
    const neo = { ensureStatuses: jest.fn() };
    const view = new NetworkGameView({ session: {}, neo });
    const floorState = {
      currentRoomId: 'room-a', visitedRoomIds: ['room-a'],
      layout: { floorNumber: 1, rooms: [{ id: 'room-a', type: 'combat' }] },
    };
    const enemy = { id: 'e1', roomId: 'room-a', health: 10, maxHealth: 10, radius: 18, spawnTick: 20 };
    view._syncNeoPresentationFloor(floorState, { e1: enemy }, {}, { tick: 20, interactables: {}, abilityEntities: {} });
    expect(neo.enemies[0].spawnT).toBeCloseTo(0.72);
    view._syncNeoPresentationFloor(floorState, { e1: enemy }, {}, { tick: 35, interactables: {}, abilityEntities: {} });
    expect(neo.enemies[0].spawnT).toBe(0);
  });

  test('keeps projected player actors stable for the shared 3D renderer', () => {
    const neo = { ATTACKS: { melee: { active: 0.17 } }, cooldowns: {} };
    const view = new NetworkGameView({ session: {}, neo });
    const state = { tick: 10 };
    const players = {
      p1: { id: 'p1', x: 10, y: 20, hp: 100, maxHp: 100, characterKey: 'princess' },
      p2: { id: 'p2', x: 30, y: 40, hp: 100, maxHp: 100, characterKey: 'metao' },
    };

    view._syncCampaignPresentationEntities(players, {}, 'p1', state);
    const firstRemoteActor = view.presentationPlayerSlots.find(slot => slot.id === 'p2').getEntity();
    players.p2.x = 55;
    view._syncCampaignPresentationEntities(players, {}, 'p1', { tick: 11 });

    expect(view.presentationPlayerSlots.find(slot => slot.id === 'p2').getEntity()).toBe(firstRemoteActor);
    expect(firstRemoteActor.x).toBe(55);
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
              { id: 'titan_heart' },
              { id: 'attack_servo' },
            ],
          },
        },
      },
      interactables: { 'chest-1': { id: 'chest-1', roomId: 'treasure', x: 450, y: 300 } },
    };

    const choices = view._upgradePresentationPickups(state);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toEqual(expect.objectContaining({
      type: 'rewardChoice', dwellMode: true, x: 378, y: 296, side: 'left', picksRemaining: 1,
      itemPresentation: expect.objectContaining({ id: 'titan_heart' }),
    }));
    expect(choices[1]).toEqual(expect.objectContaining({ x: 522, y: 296, side: 'right' }));
    view._updateUpgradeDwell({ x: choices[0].x, y: choices[0].y }, state, 2.2);
    expect(sent).toEqual([['chest-1', 'titan_heart']]);
  });

  test('requests authority chest activation at the same proximity as single player', () => {
    const sent = [];
    const view = new NetworkGameView({
      session: { sendInteract: id => sent.push(id) },
      neo: {},
    });
    const state = {
      interactables: {
        chest: { id: 'chest', kind: 'relic_chest', roomId: 'treasure', x: 200, y: 200 },
      },
    };
    view._syncAutomaticChestInteraction({ roomId: 'treasure', x: 235, y: 200 }, state);
    view._syncAutomaticChestInteraction({ roomId: 'treasure', x: 234, y: 200 }, state);
    view._syncAutomaticChestInteraction({ roomId: 'treasure', x: 234, y: 200 }, state);
    expect(sent).toEqual(['chest']);
  });

  test('uses the campaign item notification for authoritative item pickups', () => {
    const pushItemNotification = jest.fn();
    const view = new NetworkGameView({
      session: { snapshot: () => ({ playerId: 'p1' }) },
      neo: { pushItemNotification, playSfx: jest.fn() },
    });
    view.currentSample = { state: { players: { p1: { id: 'p1', roomId: 'room-a' } } } };
    view._consumeGameplayEvents([{
      eventId: 'pickup-1', eventType: 'PICKUP_COLLECTED',
      data: { playerId: 'p1', roomId: 'room-a', pickupType: 'item', itemKey: 'titan_heart', amount: 1 },
    }]);
    expect(pushItemNotification).toHaveBeenCalledWith('titan_heart', 1);
  });

  test('uses the same campaign item notification for A/B chest selection rewards', () => {
    const pushItemNotification = jest.fn();
    const view = new NetworkGameView({
      session: { snapshot: () => ({ playerId: 'p1' }) },
      neo: { pushItemNotification, playSfx: jest.fn() },
    });
    view.currentSample = { state: { players: { p1: { id: 'p1', roomId: 'room-a' } } } };
    view._consumeGameplayEvents([{
      eventId: 'upgrade-1', eventType: 'UPGRADE_APPLIED',
      data: { playerId: 'p1', roomId: 'room-a', itemKey: 'neo_knife', amount: 1 },
    }]);
    expect(pushItemNotification).toHaveBeenCalledWith('neo_knife', 1);
  });

  test('does not show another player\'s acquisition as the local player\'s item card', () => {
    const pushItemNotification = jest.fn();
    const view = new NetworkGameView({
      session: { snapshot: () => ({ playerId: 'p1' }) },
      neo: { pushItemNotification, playSfx: jest.fn() },
    });
    view.currentSample = { state: { players: {
      p1: { id: 'p1', roomId: 'room-a' }, p2: { id: 'p2', roomId: 'room-a' },
    } } };
    view._consumeGameplayEvents([{
      eventId: 'pickup-p2', eventType: 'PICKUP_COLLECTED',
      data: { playerId: 'p2', roomId: 'room-a', itemKey: 'titan_heart', amount: 1 },
    }]);
    expect(pushItemNotification).not.toHaveBeenCalled();
  });

  test('keeps normal room pillars and chamber geometry in network presentation', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/rendering/NetworkGameView.js'), 'utf8');
    expect(source).not.toContain('_hydrateRoomDecor');
    expect(source).not.toContain('decorateRoomData(room)');
    expect(source).toContain('Object.assign(room, source');
    expect(source).toContain('this.neo.structures = this.neo.currentRoom?.structures || []');
    expect(source).toContain('this.neo.destructibles = this.neo.currentRoom?.destructibles || []');
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
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('_syncCampaignPresentationEntities(visiblePlayers, projectiles, localPlayerId, state, frameDelta)');
    expect(fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8')).toContain('Neo.threeRenderer?.render?.()');
    expect(fs.readFileSync(path.join(root, 'js/draw/environment.js'), 'utf8')).toContain('Neo.drawWorldViewport(Neo.camera');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('this.neo.decorateRoomData(room)');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).toContain('this.neo.updateHud?.()');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('this.neo.uiController?.setHudValues');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('_drawAbilityEffects');
    expect(fs.readFileSync(path.join(root, 'js/draw/viewport.js'), 'utf8')).toContain('Neo.drawActivePlayerEffects?.()');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain("ctx.font = '700 16px VT323, monospace'");
    expect(fs.readFileSync(path.join(root, 'js/draw/viewport.js'), 'utf8')).toContain('Neo.presentationPlayerSlots');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('_renderLegacyFallback');
    expect(fs.readFileSync(path.join(root, 'js/rendering/NetworkGameView.js'), 'utf8')).not.toContain('_drawPlayer(');
  });
});
