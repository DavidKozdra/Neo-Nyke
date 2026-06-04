const {
  createRequestUrl,
  parseSeed,
  parseWinnersCount,
  toUtcDateString,
} = require('../scripts/run-tests');

describe('server test runner helpers', () => {
  test('createRequestUrl composes endpoint paths', () => {
    expect(createRequestUrl('https://example.com/api', '/seed')).toBe('https://example.com/api/seed');
    expect(createRequestUrl('https://example.com/api/', 'leaderboard?page=1')).toBe('https://example.com/api/leaderboard?page=1');
  });

  test('parseSeed returns a string seed when present', () => {
    expect(parseSeed({ seed: '12345' })).toBe('12345');
    expect(parseSeed({ seed: 42 })).toBe('42');
  });

  test('parseSeed returns unavailable when missing', () => {
    expect(parseSeed({})).toBe('unavailable');
    expect(parseSeed(null)).toBe('unavailable');
  });

  test('parseWinnersCount prefers totalEntries', () => {
    expect(parseWinnersCount({ totalEntries: 17, data: [1, 2, 3] })).toBe(17);
  });

  test('parseWinnersCount falls back to data length', () => {
    expect(parseWinnersCount({ data: [{}, {}, {}] })).toBe(3);
  });

  test('parseWinnersCount returns 0 on invalid payload', () => {
    expect(parseWinnersCount({})).toBe(0);
    expect(parseWinnersCount(null)).toBe(0);
  });

  test('toUtcDateString formats YYYY-MM-DD in UTC', () => {
    expect(toUtcDateString(new Date('2026-06-02T21:45:00.000Z'))).toBe('2026-06-02');
  });
});