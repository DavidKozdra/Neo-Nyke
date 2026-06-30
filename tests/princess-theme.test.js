const fs = require('node:fs');
const path = require('node:path');

// Pull a top-level `function name(...) {...}` (optionally `async`) out of source
// by brace-matching, so it can be evaluated in an injected-dependency sandbox.
function extractFunction(source, functionName) {
  let start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`Missing function ${functionName}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  return source.slice(start, end + 1);
}

const playerSource = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(__dirname, '../js/ui/settings-ui.js'), 'utf8');

// The princess menu preset's distinctive accent, used to assert that the
// princess theme vars (and not the base/dark ones) were applied.
const PRINCESS_ACCENT = '#f47ebd';
const DARK_ACCENT = (() => {
  // Read the dark preset's --menu-accent straight from source so the test
  // tracks the real value rather than a hardcoded copy.
  const m = settingsSource.match(/dark:\s*\{[\s\S]*?'--menu-accent':\s*'([^']+)'/);
  return m ? m[1] : null;
})();

// ── syncCharacterUiTheme (player.js) ─────────────────────────────────────────
// Drives the `html.princess-ui` body class and delegates menu-var application
// to NeoSettings.applyEffectiveTheme. Harness injects DOM + settings stubs and
// records both the class toggle and the key passed to applyEffectiveTheme.
function createSyncHarness({ character = 'thorn_knight', activeTheme = undefined, hasExplicitTheme } = {}) {
  const settingsPayload = activeTheme === undefined ? {} : { activeTheme };
  let princessClass = false;
  const effectiveThemeCalls = [];

  const Neo = { player: { character }, chosenCharacter: character };
  const localStorage = {
    getItem: key => (key === 'neonyke:settings' ? JSON.stringify(settingsPayload) : null),
  };
  const NeoSettings = {
    applyEffectiveTheme: key => effectiveThemeCalls.push(key),
  };
  if (hasExplicitTheme !== undefined) NeoSettings.hasExplicitTheme = () => hasExplicitTheme;

  const document = {
    documentElement: {
      classList: {
        toggle: (cls, on) => { if (cls === 'princess-ui') princessClass = on; },
      },
    },
  };
  const window = { NeoSettings, addEventListener: () => {} };

  const dependencies = { Neo, localStorage, document, window };
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `let settingsThemeSyncBound = true;
     const SETTINGS_STORE_KEY = 'neonyke:settings';
     ${extractFunction(playerSource, 'getUiCharacterKey')}
     ${extractFunction(playerSource, 'getSettingsActiveTheme')}
     ${extractFunction(playerSource, 'syncCharacterUiTheme')}
     return syncCharacterUiTheme;`,
  );
  const syncCharacterUiTheme = factory(...names.map(n => dependencies[n]));

  return {
    run: () => syncCharacterUiTheme(),
    hasPrincessClass: () => princessClass,
    effectiveThemeCalls,
  };
}

// ── applyEffectiveTheme + hasExplicitTheme (settings-ui.js) ──────────────────
// Resolves which --menu-* vars are in effect. Harness injects the preset table
// and a captured applyThemeVars so the test sees which palette was applied.
function createEffectiveThemeHarness({ activeTheme = '', savedThemes = {}, customThemeVars = {} } = {}) {
  const applied = [];
  const PRESET_THEMES = {
    dark: { name: 'Dark', vars: { '--menu-accent': DARK_ACCENT } },
    princess: { name: 'Princess', vars: { '--menu-accent': PRINCESS_ACCENT } },
  };

  const dependencies = {
    PRESET_THEMES,
    savedThemes,
    customThemeVars,
    activeTheme,
    applyThemeVars: vars => applied.push(vars),
  };
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `${extractFunction(settingsSource, 'hasExplicitTheme')}
     ${extractFunction(settingsSource, 'applyEffectiveTheme')}
     return { hasExplicitTheme, applyEffectiveTheme };`,
  );
  const api = factory(...names.map(n => dependencies[n]));

  return {
    hasExplicitTheme: api.hasExplicitTheme,
    applyEffectiveTheme: api.applyEffectiveTheme,
    lastAppliedAccent: () => (applied.length ? applied[applied.length - 1]['--menu-accent'] : null),
  };
}

describe('princess theme follows the active character unless overridden', () => {
  // ── Body class + delegation (player.js) ──
  test('princess character with no settings theme activates the princess skin', () => {
    const h = createSyncHarness({ character: 'princess', hasExplicitTheme: false });
    h.run();
    expect(h.hasPrincessClass()).toBe(true);
    expect(h.effectiveThemeCalls).toEqual(['princess']);
  });

  test('non-princess character with no settings theme does not use the princess skin', () => {
    const h = createSyncHarness({ character: 'thorn_knight', hasExplicitTheme: false });
    h.run();
    expect(h.hasPrincessClass()).toBe(false);
    expect(h.effectiveThemeCalls).toEqual(['thorn_knight']);
  });

  test('explicitly picking the princess theme keeps the skin on any character', () => {
    const h = createSyncHarness({ character: 'thorn_knight', activeTheme: 'princess', hasExplicitTheme: true });
    h.run();
    expect(h.hasPrincessClass()).toBe(true);
    expect(h.effectiveThemeCalls).toEqual(['thorn_knight']);
  });

  test('an explicit non-princess theme overrides the princess character default', () => {
    const h = createSyncHarness({ character: 'princess', activeTheme: 'nature', hasExplicitTheme: true });
    h.run();
    expect(h.hasPrincessClass()).toBe(false);
    expect(h.effectiveThemeCalls).toEqual(['princess']);
  });

  test('a persisted "dark" theme is not an override, so princess still themes itself', () => {
    // No NeoSettings.hasExplicitTheme override here: exercises player.js's own
    // fallback that treats 'dark' as "no real override".
    const h = createSyncHarness({ character: 'princess', activeTheme: 'dark' });
    h.run();
    expect(h.hasPrincessClass()).toBe(true);
  });

  // ── Var resolution priority (settings-ui.js) ──
  test('no override + princess character applies the princess menu palette', () => {
    const h = createEffectiveThemeHarness({ activeTheme: '' });
    h.applyEffectiveTheme('princess');
    expect(h.lastAppliedAccent()).toBe(PRINCESS_ACCENT);
  });

  test('no override + other character falls back to the base palette', () => {
    const h = createEffectiveThemeHarness({ activeTheme: '' });
    h.applyEffectiveTheme('thorn_knight');
    expect(h.lastAppliedAccent()).toBe(DARK_ACCENT);
  });

  test('an explicit preset override wins even for the princess character', () => {
    const h = createEffectiveThemeHarness({ activeTheme: 'dark' });
    // 'dark' is identical to base and reads as "no override", so princess still wins.
    h.applyEffectiveTheme('princess');
    expect(h.lastAppliedAccent()).toBe(PRINCESS_ACCENT);

    const saved = createEffectiveThemeHarness({
      activeTheme: 'sunrise',
      savedThemes: { sunrise: { name: 'Sunrise', vars: { '--menu-accent': '#abcabc' } } },
    });
    expect(saved.hasExplicitTheme()).toBe(true);
    saved.applyEffectiveTheme('princess');
    expect(saved.lastAppliedAccent()).toBe('#abcabc');
  });

  test('a _custom override applies the player-edited vars', () => {
    const h = createEffectiveThemeHarness({
      activeTheme: '_custom',
      customThemeVars: { '--menu-accent': '#123456' },
    });
    expect(h.hasExplicitTheme()).toBe(true);
    h.applyEffectiveTheme('princess');
    expect(h.lastAppliedAccent()).toBe('#123456');
  });
});
