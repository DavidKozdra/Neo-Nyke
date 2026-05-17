// Shared holiday matching utilities — used by settings-ui.js and tests.

const SPECIAL_DAYS = [
  { id: 'kiah-birthday',       type: 'birthday', mmdd: '04-06',                   title: "Happy Birthday, Kiah!", icon: '🎂', accent: '#f47ebd' },
  { id: 'christmas',           type: 'holiday',  mmdd: '12-25',                   title: "Merry Christmas!",      icon: '🎄', accent: '#4caf50' },
  { id: 'festival-of-lights',  type: 'holiday',  mmdd: '12-01', mmddEnd: '12-08', title: "Festival of Lights",    icon: '🕎', accent: '#4fc3f7' },
];

function mmddToNum(s) {
  const [m, d] = s.split('-');
  return Number(m) * 100 + Number(d);
}

// dateStr: 'MM-DD' string for "today" (injectable for testing)
function matchesDay(entry, dateStr) {
  const today = mmddToNum(dateStr);
  const start = mmddToNum(entry.mmdd);
  const end   = entry.mmddEnd ? mmddToNum(entry.mmddEnd) : start;
  return today >= start && today <= end;
}

// storedValue: 'YYYY-MM-DD', todayStr: 'MM-DD'
function isUserBirthday(storedValue, todayStr) {
  if (!storedValue) return false;
  const [, mm, dd] = storedValue.split('-');
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` === todayStr;
}

// Returns the first matching special day entry for the given MM-DD, or null.
function getActiveSpecialDay(dateStr) {
  return SPECIAL_DAYS.find(e => matchesDay(e, dateStr)) ?? null;
}

if (typeof module !== 'undefined') {
  module.exports = { SPECIAL_DAYS, mmddToNum, matchesDay, isUserBirthday, getActiveSpecialDay };
}
