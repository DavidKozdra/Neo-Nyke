const { RandomService } = require('../js/simulation/RandomService');
const { generateFloorLayout } = require('../js/simulation/DeterministicFloorGenerator');

describe('deterministic multiplayer floor generation', () => {
  const options = {
    matchSeed: 'weekly-seed-2026-29',
    floorNumber: 4,
    generationVersion: 1,
    contentVersion: '1.0.0-test',
  };

  test('independent generators produce the same serialized floor', () => {
    const authorityFloor = generateFloorLayout(options);
    const clientFloor = generateFloorLayout(options);

    expect(JSON.stringify(clientFloor)).toBe(JSON.stringify(authorityFloor));
    expect(authorityFloor.rooms.length).toBeGreaterThanOrEqual(2);
    expect(new Set(authorityFloor.rooms.map(room => room.id)).size).toBe(authorityFloor.rooms.length);
  });

  test('different floor seeds produce different representations', () => {
    const first = generateFloorLayout({ ...options, floorSeed: 'floor-a' });
    const second = generateFloorLayout({ ...options, floorSeed: 'floor-b' });

    expect(JSON.stringify(second.rooms)).not.toBe(JSON.stringify(first.rooms));
  });

  test('unrelated random streams do not perturb floor generation', () => {
    const baseline = new RandomService(options);
    const perturbed = new RandomService(options);
    for (let index = 0; index < 50; index += 1) perturbed.next('loot');

    const baselineDraws = Array.from({ length: 20 }, () => baseline.next('floor-generation'));
    const perturbedDraws = Array.from({ length: 20 }, () => perturbed.next('floor-generation'));
    expect(perturbedDraws).toEqual(baselineDraws);
  });

  test('one injected campaign stream drives the exact browser and authority floor contract', () => {
    const values = Array.from({ length: 500 }, (_, index) => ((index * 73 + 19) % 997) / 997);
    const stream = () => {
      let cursor = 0;
      const api = {
        next: () => values[(cursor++) % values.length],
        int(min, max) { return min + Math.floor(api.next() * (max - min + 1)); },
        pick(items) { return items[Math.floor(api.next() * items.length)]; },
        chance(probability) { return api.next() < probability; },
        shuffle(items) {
          const copy = items.slice();
          for (let index = copy.length - 1; index > 0; index -= 1) {
            const other = Math.floor(api.next() * (index + 1));
            [copy[index], copy[other]] = [copy[other], copy[index]];
          }
          return copy;
        },
      };
      return api;
    };
    const parityOptions = { ...options, floorNumber: 2, runLoopIndex: 1 };
    const browserFloor = generateFloorLayout({ ...parityOptions, random: stream() });
    const authorityFloor = generateFloorLayout({ ...parityOptions, random: stream() });

    expect(authorityFloor).toEqual(browserFloor);
    expect(authorityFloor.rooms.some(room => room.type === 'portal')).toBe(true);
  });
});
