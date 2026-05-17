const { SPECIAL_DAYS, mmddToNum, matchesDay, isUserBirthday, getActiveSpecialDay } = require('../js/ui/holiday-utils');

// ── mmddToNum ─────────────────────────────────────────────────────────────────

describe('mmddToNum', () => {
  test('converts MM-DD to numeric month*100+day', () => {
    expect(mmddToNum('04-06')).toBe(406);
    expect(mmddToNum('12-25')).toBe(1225);
    expect(mmddToNum('01-01')).toBe(101);
    expect(mmddToNum('12-31')).toBe(1231);
  });
});

// ── matchesDay ────────────────────────────────────────────────────────────────

describe('matchesDay — single-day entries', () => {
  const christmas = SPECIAL_DAYS.find(e => e.id === 'christmas');

  test('matches on the exact day', () => {
    expect(matchesDay(christmas, '12-25')).toBe(true);
  });

  test('does not match the day before', () => {
    expect(matchesDay(christmas, '12-24')).toBe(false);
  });

  test('does not match the day after', () => {
    expect(matchesDay(christmas, '12-26')).toBe(false);
  });

  test('does not match an unrelated date', () => {
    expect(matchesDay(christmas, '06-15')).toBe(false);
  });
});

describe('matchesDay — multi-day range (Festival of Lights 12-01 to 12-08)', () => {
  const festival = SPECIAL_DAYS.find(e => e.id === 'festival-of-lights');

  test('matches on start date', () => {
    expect(matchesDay(festival, '12-01')).toBe(true);
  });

  test('matches on end date', () => {
    expect(matchesDay(festival, '12-08')).toBe(true);
  });

  test('matches mid-range', () => {
    expect(matchesDay(festival, '12-04')).toBe(true);
  });

  test('does not match the day before start', () => {
    expect(matchesDay(festival, '11-30')).toBe(false);
  });

  test('does not match the day after end', () => {
    expect(matchesDay(festival, '12-09')).toBe(false);
  });
});

describe('matchesDay — Kiah birthday (04-06)', () => {
  const kiahBirthday = SPECIAL_DAYS.find(e => e.id === 'kiah-birthday');

  test('matches on April 6', () => {
    expect(matchesDay(kiahBirthday, '04-06')).toBe(true);
  });

  test('does not match April 5', () => {
    expect(matchesDay(kiahBirthday, '04-05')).toBe(false);
  });

  test('does not match April 7', () => {
    expect(matchesDay(kiahBirthday, '04-07')).toBe(false);
  });
});

// ── isUserBirthday ────────────────────────────────────────────────────────────

describe('isUserBirthday', () => {
  test('returns true when stored birthday MM-DD matches today', () => {
    expect(isUserBirthday('1990-07-15', '07-15')).toBe(true);
  });

  test('returns false when day differs', () => {
    expect(isUserBirthday('1990-07-15', '07-16')).toBe(false);
  });

  test('returns false when month differs', () => {
    expect(isUserBirthday('1990-07-15', '08-15')).toBe(false);
  });

  test('returns false for null stored value', () => {
    expect(isUserBirthday(null, '07-15')).toBe(false);
  });

  test('returns false for undefined stored value', () => {
    expect(isUserBirthday(undefined, '07-15')).toBe(false);
  });

  test('returns false for empty string stored value', () => {
    expect(isUserBirthday('', '07-15')).toBe(false);
  });

  test('pads single-digit month and day correctly (1990-4-6 → 04-06)', () => {
    // split('-') on '1990-4-6' gives ['1990','4','6']
    expect(isUserBirthday('1990-4-6', '04-06')).toBe(true);
  });

  test('year is ignored — different years still match', () => {
    expect(isUserBirthday('2000-12-25', '12-25')).toBe(true);
    expect(isUserBirthday('1985-12-25', '12-25')).toBe(true);
  });
});

// ── getActiveSpecialDay ───────────────────────────────────────────────────────

describe('getActiveSpecialDay', () => {
  test('returns christmas entry on 12-25', () => {
    const result = getActiveSpecialDay('12-25');
    expect(result).not.toBeNull();
    expect(result.id).toBe('christmas');
    expect(result.icon).toBe('🎄');
    expect(result.accent).toBe('#4caf50');
  });

  test('returns festival entry on 12-03 (mid-range)', () => {
    const result = getActiveSpecialDay('12-03');
    expect(result).not.toBeNull();
    expect(result.id).toBe('festival-of-lights');
  });

  test('returns kiah-birthday entry on 04-06', () => {
    const result = getActiveSpecialDay('04-06');
    expect(result).not.toBeNull();
    expect(result.id).toBe('kiah-birthday');
    expect(result.type).toBe('birthday');
  });

  test('returns null on a date with no special day', () => {
    expect(getActiveSpecialDay('06-15')).toBeNull();
    expect(getActiveSpecialDay('01-01')).toBeNull();
    expect(getActiveSpecialDay('11-30')).toBeNull();
  });

  test('festival ends — 12-09 returns null', () => {
    expect(getActiveSpecialDay('12-09')).toBeNull();
  });

  test('festival starts — 12-01 returns festival', () => {
    const result = getActiveSpecialDay('12-01');
    expect(result?.id).toBe('festival-of-lights');
  });
});

// ── SPECIAL_DAYS data integrity ───────────────────────────────────────────────

describe('SPECIAL_DAYS data integrity', () => {
  test('every entry has id, type, mmdd, title, icon, and accent', () => {
    for (const entry of SPECIAL_DAYS) {
      expect(entry.id).toBeTruthy();
      expect(entry.type).toMatch(/^(birthday|holiday|update|event)$/);
      expect(entry.mmdd).toMatch(/^\d{2}-\d{2}$/);
      expect(entry.title).toBeTruthy();
      expect(entry.icon).toBeTruthy();
      expect(entry.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('mmddEnd, when present, is after mmdd', () => {
    for (const entry of SPECIAL_DAYS) {
      if (entry.mmddEnd) {
        expect(mmddToNum(entry.mmddEnd)).toBeGreaterThan(mmddToNum(entry.mmdd));
      }
    }
  });

  test('all IDs are unique', () => {
    const ids = SPECIAL_DAYS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
