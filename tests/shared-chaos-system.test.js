const {
  rollChaosCharacter,
  rollChaosLoadout,
  rollChaosEnemyLevel,
  resolveChaosReincarnation,
  createChaosFirstFloorLayout,
} = require('../js/simulation/SharedChaosSystem');

describe('SharedChaosSystem', () => {
  describe('Shapeshifter', () => {
    test('always rerolls to a different character when one is available', () => {
      const candidates = ['thorn_knight', 'princess', 'metao'];
      // Sweep the whole random range: no roll may return the worn character.
      for (let step = 0; step < 20; step += 1) {
        const rolled = rollChaosCharacter({
          currentCharacter: 'princess',
          candidates,
          random: () => step / 20,
        });
        expect(rolled).not.toBe('princess');
        expect(candidates).toContain(rolled);
      }
    });

    test('keeps the current character when it is the only candidate', () => {
      expect(rollChaosCharacter({
        currentCharacter: 'metao', candidates: ['metao'], random: () => 0.99,
      })).toBe('metao');
    });
  });

  describe('Loose Grip', () => {
    const slotOf = key => ({
      slash: 'melee', punch: 'melee', blood_beam: 'laser', dash: 'dash', smash: 'smash',
    }[key] || '');

    test('rerolls every slot from owned moves the character may equip', () => {
      const rolled = rollChaosLoadout({
        equippedMoves: { melee: 'slash', laser: 'blood_beam', smash: 'smash', dash: 'dash' },
        ownedMoves: ['slash', 'punch', 'blood_beam', 'smash', 'dash'],
        slotOf,
        isAllowed: () => true,
        random: () => 0.99,
      });
      expect(slotOf(rolled.melee)).toBe('melee');
      expect(rolled.laser).toBe('blood_beam');
      expect(rolled.dash).toBe('dash');
    });

    test('never equips a move the character is not allowed to hold', () => {
      const rolled = rollChaosLoadout({
        equippedMoves: { melee: 'slash' },
        ownedMoves: ['slash', 'punch'],
        slotOf,
        isAllowed: key => key !== 'punch',
        random: () => 0.99,
      });
      expect(rolled.melee).toBe('slash');
    });

    test('keeps the equipped move when a slot has no legal candidate', () => {
      const rolled = rollChaosLoadout({
        equippedMoves: { melee: 'slash', laser: 'blood_beam' },
        ownedMoves: [],
        slotOf,
        isAllowed: () => true,
        random: () => 0.5,
      });
      expect(rolled.melee).toBe('slash');
      expect(rolled.laser).toBe('blood_beam');
    });
  });

  describe('Lottery Levels', () => {
    test('rolls across the whole range regardless of depth, never below 1', () => {
      expect(rollChaosEnemyLevel({ progressionDepth: 1, random: () => 0 })).toBe(1);
      // A floor-1 encounter can still roll near the cap: that flatness is the mod.
      const shallowHigh = rollChaosEnemyLevel({ progressionDepth: 1, random: () => 0.999 });
      expect(shallowHigh).toBeGreaterThan(1);
      // A deep encounter can still roll the minimum.
      expect(rollChaosEnemyLevel({ progressionDepth: 30, random: () => 0 })).toBe(1);
    });

    test('stays inside the cap at the top of the random range', () => {
      const cap = 12;
      expect(rollChaosEnemyLevel({ maxLevel: cap, random: () => 0.9999 })).toBeLessThanOrEqual(cap);
    });
  });

  describe('Reincarnation', () => {
    const roster = ['enemy_hunter', 'enemy_golem'];

    test('respawns as a roster enemy at reduced health', () => {
      const result = resolveChaosReincarnation({ active: true, floor: 3, usedOnFloor: 0, roster, random: () => 0 });
      expect(result.ok).toBe(true);
      expect(roster).toContain(result.characterKey);
      expect(result.hpFraction).toBeLessThan(1);
    });

    test('allows one respawn per floor and re-arms on the next floor', () => {
      expect(resolveChaosReincarnation({ active: true, floor: 3, usedOnFloor: 3, roster, random: () => 0 }))
        .toMatchObject({ ok: false, reason: 'CHAOS_REINCARNATION_SPENT' });
      expect(resolveChaosReincarnation({ active: true, floor: 4, usedOnFloor: 3, roster, random: () => 0 }).ok)
        .toBe(true);
    });

    test('declines when inactive or with no roster', () => {
      expect(resolveChaosReincarnation({ active: false, floor: 1, roster }).ok).toBe(false);
      expect(resolveChaosReincarnation({ active: true, floor: 1, roster: [] }))
        .toMatchObject({ ok: false, reason: 'CHAOS_REINCARNATION_NO_ROSTER' });
    });
  });

  describe('Architect', () => {
    const plan = {
      gridSize: 9,
      cells: [
        { gx: 0, gy: 0, type: 'start' },
        { gx: 1, gy: 0, type: 'combat' },
        { gx: 2, gy: 0, type: 'shop' },
        { gx: 2, gy: 1, type: 'exit' },
      ],
    };

    test('builds rooms with doors between orthogonally adjacent cells', () => {
      const layout = createChaosFirstFloorLayout(plan, { runLoopIndex: 0 });
      expect(layout.rooms).toHaveLength(4);
      expect(layout.startRoomId).toBe('room-0-0');
      expect(layout.exitRoomId).toBe('room-2-1');
      const corner = layout.rooms.find(room => room.id === 'room-2-0');
      expect(corner.doors).toMatchObject({ w: true, s: true, n: false, e: false });
      // A cell with no neighbour on a side gets no door there.
      const start = layout.rooms.find(room => room.id === 'room-0-0');
      expect(start.doors).toMatchObject({ e: true, w: false, n: false, s: false });
    });

    test('start and exit are placement roles, not room types', () => {
      const layout = createChaosFirstFloorLayout(plan, { runLoopIndex: 0 });
      expect(layout.rooms.find(room => room.id === 'room-0-0').type).toBe('combat');
      expect(layout.rooms.find(room => room.id === 'room-2-1').type).toBe('combat');
      // Authored non-role types survive.
      expect(layout.rooms.find(room => room.id === 'room-2-0').type).toBe('shop');
    });

    test('returns null for an empty or role-less plan rather than a broken floor', () => {
      expect(createChaosFirstFloorLayout(null, {})).toBeNull();
      expect(createChaosFirstFloorLayout({ cells: [] }, {})).toBeNull();
      expect(createChaosFirstFloorLayout({ cells: [{ gx: 0, gy: 0, type: 'combat' }] }, {})).toBeNull();
    });
  });
});
