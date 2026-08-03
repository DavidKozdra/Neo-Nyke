const {
  LOOP_CAMPAIGN_LENGTH,
  LOOP_MILESTONES,
  getLoopMilestone,
  getLoopFloorPlan,
  getUnlockedLoopRoomTypes,
  getUnlockedSecretKinds,
} = require('../js/simulation/LoopContentSystem');
const { generateFloorLayout } = require('../js/simulation/DeterministicFloorGenerator');
const { createCampaignSecretRoomPlan } = require('../js/simulation/SharedRoomLifecycleSystem');
const { applySpecialRoomChoice } = require('../js/simulation/SharedSpecialRoomSystem');
const fs = require('fs');
const path = require('path');

describe('twenty-loop content protocol', () => {
  test('authors one named progression beat for every loop through GODLOOP', () => {
    expect(LOOP_CAMPAIGN_LENGTH).toBe(20);
    expect(LOOP_MILESTONES).toHaveLength(20);
    expect(LOOP_MILESTONES.map(entry => entry.number)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(getLoopMilestone(19)).toMatchObject({ number: 20, title: 'GODLOOP' });
    expect(getLoopMilestone(20)).toMatchObject({ number: 21, title: 'BEYOND GODLOOP' });
  });

  test('gates five new service families at their authored loop counts', () => {
    expect(getUnlockedLoopRoomTypes(0)).not.toContain('chronicle');
    expect(getUnlockedLoopRoomTypes(1)).toContain('chronicle');
    expect(getUnlockedLoopRoomTypes(3)).toContain('armory');
    expect(getUnlockedLoopRoomTypes(6)).toContain('mutation_lab');
    expect(getUnlockedLoopRoomTypes(9)).toContain('observatory');
    expect(getUnlockedLoopRoomTypes(12)).not.toContain('void_market');
    expect(getUnlockedLoopRoomTypes(13)).toContain('void_market');
  });

  test('gates six new secret archetypes instead of exposing late content early', () => {
    expect(getUnlockedSecretKinds(0)).toEqual(['vendor', 'warp']);
    expect(getUnlockedSecretKinds(1)).toContain('echo_cache');
    expect(getUnlockedSecretKinds(3)).toContain('blood_forge');
    expect(getUnlockedSecretKinds(5)).toContain('time_capsule');
    expect(getUnlockedSecretKinds(8)).toContain('mimic_den');
    expect(getUnlockedSecretKinds(11)).toContain('star_shrine');
    expect(getUnlockedSecretKinds(14)).not.toContain('null_chamber');
    expect(getUnlockedSecretKinds(15)).toContain('null_chamber');
  });

  test('scales maps, services, secrets, recovery, and rewards into a survivable loop 20', () => {
    expect(getLoopFloorPlan(0)).toMatchObject({ extraRooms: 0, serviceRoomCount: 1, secretRoomCount: 1, rewardOptions: 3, rewardPicks: 1 });
    expect(getLoopFloorPlan(19)).toMatchObject({
      loopNumber: 20, extraRooms: 4, serviceRoomCount: 3, secretRoomCount: 3,
      rewardOptions: 6, rewardPicks: 2, recoveryFraction: 0.44,
    });
  });

  test('makes debut content deterministic and immediately reachable on floor one', () => {
    const unlocks = [
      [1, 'chronicle', 'echo_cache'], [3, 'armory', 'blood_forge'], [6, 'mutation_lab', null],
      [9, 'observatory', null], [13, 'void_market', null], [15, null, 'null_chamber'],
    ];
    unlocks.forEach(([loopIndex, serviceType, secretKind]) => {
      const options = { matchSeed: 'loop-protocol', floorSeed: `loop-${loopIndex}`, floorNumber: 1, runLoopIndex: loopIndex };
      const first = generateFloorLayout(options);
      expect(generateFloorLayout(options)).toEqual(first);
      if (serviceType) expect(first.rooms.some(room => room.type === serviceType)).toBe(true);
      if (secretKind) expect(first.rooms.some(room => room.secretKind === secretKind)).toBe(true);
      expect(first.loopMilestone).toEqual(getLoopMilestone(loopIndex));
    });
  });

  test('loop 20 floors contain the full multi-room protocol without duplicate coordinates', () => {
    const floor = generateFloorLayout({ matchSeed: 'godloop', floorSeed: 'godloop-floor-7', floorNumber: 7, runLoopIndex: 19 });
    const coordinates = floor.rooms.map(room => `${room.gx},${room.gy}`);
    expect(new Set(coordinates).size).toBe(coordinates.length);
    expect(floor.rooms.filter(room => room.secret)).toHaveLength(3);
    expect(floor.rooms.filter(room => getUnlockedLoopRoomTypes(19).includes(room.type))).toHaveLength(3);
    expect(floor.rooms.length).toBeGreaterThanOrEqual(14);
  });

  test('all 200 authored floor states across loops 1-20 stay deterministic, connected, and correctly gated', () => {
    const allLoopRooms = new Set(getUnlockedLoopRoomTypes(19));
    for (let loopIndex = 0; loopIndex < 20; loopIndex += 1) {
      const allowedRooms = new Set(getUnlockedLoopRoomTypes(loopIndex));
      const allowedSecrets = new Set(getUnlockedSecretKinds(loopIndex));
      for (let floorNumber = 1; floorNumber <= 10; floorNumber += 1) {
        const options = {
          matchSeed: 'twenty-loop-audit',
          floorSeed: `twenty-loop-audit:${loopIndex}:${floorNumber}`,
          floorNumber,
          runLoopIndex: loopIndex,
        };
        const layout = generateFloorLayout(options);
        expect(generateFloorLayout(options)).toEqual(layout);
        expect(layout.runLoopIndex).toBe(loopIndex);
        expect(layout.loopMilestone.number).toBe(loopIndex + 1);
        const mainRooms = layout.rooms.filter(room => !room.secret);
        const byCoordinate = new Map(mainRooms.map(room => [`${room.gx},${room.gy}`, room]));
        const visited = new Set([layout.startRoomId]);
        const queue = [mainRooms.find(room => room.id === layout.startRoomId)];
        while (queue.length) {
          const room = queue.shift();
          [[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
            const next = byCoordinate.get(`${room.gx + dx},${room.gy + dy}`);
            if (!next || visited.has(next.id)) return;
            visited.add(next.id);
            queue.push(next);
          });
        }
        expect(visited.size).toBe(mainRooms.length);
        layout.rooms.filter(room => room.secret).forEach(room => expect(allowedSecrets.has(room.secretKind)).toBe(true));
        layout.rooms.filter(room => allLoopRooms.has(room.type)).forEach(room => expect(allowedRooms.has(room.type)).toBe(true));
      }
    }
  });

  test.each([
    ['echo_cache', 'rewardChoice'],
    ['blood_forge', 'secretVendor'],
    ['time_capsule', 'secretWarp'],
    ['mimic_den', 'secret_boss_chest'],
    ['star_shrine', 'secretLady'],
    ['null_chamber', 'rewardChoice'],
  ])('%s produces playable shared pickup descriptors', (secretKind, pickupType) => {
    let roll = 0;
    const rewards = ['neo_knife', 'tough_bandaid', 'artificer_charger', 'jesters_dice', 'naked_kings_last_penny'];
    const plan = createCampaignSecretRoomPlan({ type: 'secret', secretKind }, {
      floorNumber: 5,
      runLoopIndex: 19,
      maxFloor: 10,
      random: () => 0.5,
      rollItem: () => rewards[(roll++) % rewards.length],
      rollEliteItem: () => rewards[(roll++) % rewards.length],
    });
    expect(plan).toMatchObject({ ok: true, secretKind });
    expect(plan.pickups.some(pickup => pickup.type === pickupType)).toBe(true);
  });

  test('authority rejects gated rooms early and resolves them after their loop unlock', () => {
    const room = { type: 'chronicle', serviceUsed: false, gx: 1, gy: 1 };
    const player = { maxHp: 100, hp: 40, xp: 0, xpToNext: 20, items: {}, coins: 0 };
    const floorState = { runLoopIndex: 0, layout: { rooms: [room] }, curses: { obscureMap: true } };
    expect(applySpecialRoomChoice({ floorNumber: 1, runLoopIndex: 0, floorState }, room, player, 'revision', { next: () => 0.5 }))
      .toMatchObject({ ok: false, reason: 'LOOP_CONTENT_LOCKED' });
    expect(applySpecialRoomChoice({ floorNumber: 1, runLoopIndex: 1, floorState: { ...floorState, runLoopIndex: 1 } }, room, player, 'revision', { next: () => 0.5 }))
      .toMatchObject({ ok: true, roomType: 'chronicle', choiceId: 'revision' });
    expect(player.hp).toBe(90);
  });

  test.each([
    ['chronicle', 'recall'], ['chronicle', 'atlas'], ['chronicle', 'revision'],
    ['armory', 'edge'], ['armory', 'plate'], ['armory', 'arsenal'],
    ['mutation_lab', 'fury'], ['mutation_lab', 'regeneration'], ['mutation_lab', 'adaptation'],
    ['observatory', 'chart'], ['observatory', 'star'], ['observatory', 'orbit'],
    ['void_market', 'purchase'], ['void_market', 'sell_life'], ['void_market', 'entropy'],
  ])('%s choice %s resolves as a shared authoritative interaction', (type, choiceId) => {
    const room = { id: type, type, gx: 1, gy: 1, serviceUsed: false };
    const state = {
      floorNumber: 5,
      runLoopIndex: 19,
      floorState: { runLoopIndex: 19, layout: { rooms: [room, { id: 'exit', type: 'ladder', gx: 2, gy: 1 }] }, curses: { obscureMap: true } },
      matchRules: {},
    };
    const player = { maxHp: 140, hp: 100, coins: 500, xp: 0, xpToNext: 40, attackPower: 10, moveSpeed: 228, items: { neo_knife: 2 } };
    const result = applySpecialRoomChoice(state, room, player, choiceId, { next: () => 0.5 });
    expect(result).toMatchObject({ ok: true, roomType: type, choiceId });
    expect(room.serviceUsed).toBe(true);
  });

  test('completing all twenty loops has a dedicated achievement contract', () => {
    const root = path.join(__dirname, '..');
    const definitions = fs.readFileSync(path.join(root, 'js/achievements.js'), 'utf8');
    const manager = fs.readFileSync(path.join(root, 'js/achievementManager.js'), 'utf8');
    expect(definitions).toContain("id: 'godloop'");
    expect(definitions).toContain("godloop:        { key: 'maxLoopIndex', target: 20");
    expect(manager).toContain("if (loopIndex >= 20) await unlock('godloop')");
  });
});
