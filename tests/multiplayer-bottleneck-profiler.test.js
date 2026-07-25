const { percentile, summarize } = require('../scripts/profile-multiplayer-bottlenecks');

describe('multiplayer bottleneck profiler summaries', () => {
  test('uses a stable lower-rank percentile for small deterministic samples', () => {
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2);
    expect(percentile([4, 1, 3, 2], 0.95)).toBe(3);
  });

  test('reports usable zero-value statistics for no samples', () => {
    expect(summarize([])).toEqual({
      count: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    });
  });
});
