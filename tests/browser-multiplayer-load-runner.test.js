const { chunks, inBatches } = require('../scripts/load-browser-multiplayer');

describe('browser multiplayer load runner', () => {
  test('splits players into stable rooms', () => {
    expect(chunks(['a', 'b', 'c', 'd', 'e'], 4)).toEqual([
      ['a', 'b', 'c', 'd'], ['e'],
    ]);
  });

  test('keeps global indices when batching browser work', async () => {
    const observed = await inBatches(['a', 'b', 'c', 'd', 'e'], 2, async (value, index) => `${index}:${value}`);
    expect(observed).toEqual(['0:a', '1:b', '2:c', '3:d', '4:e']);
  });
});
