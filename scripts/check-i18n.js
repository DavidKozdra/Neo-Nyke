const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const localeDir = path.join(root, 'assets', 'i18n');
const sourceLocale = 'en';
const strict = process.argv.includes('--strict');
const sourceFiles = [
  { file: 'js/ui/input.js', exports: ['MOVE_DEFS', 'WEAPON_DEFS', 'ITEM_DEFS', 'SCROLL_DEFS'] },
  { file: 'js/core/game-core.js', exports: ['DIFFICULTY_DEFS', 'CHALLENGE_DEFS', 'LEGACY_UPGRADE_DEFS', 'CHARACTER_DEFS', 'STATUS_STYLES'] },
];
const localizableFields = ['name', 'shortName', 'label', 'title', 'subtitle', 'description', 'desc'];
const unchangedStrictValues = new Set([
  'AOE',
  'DMG',
  'DUR',
  'GOD',
  'HP',
  'HUD',
  'P1',
  'P2',
  'P3',
  'P4',
  'RNG',
  'UI',
  'XP',
  'Antony Blemmyae',
  'Excalibur',
  'Gorba Gorba',
  'Katana Excalibur 777X',
  'Metao',
  'Mooggy',
]);

function isPunctuationOnly(value) {
  return /^[\s.?!,;:()[\]{}'"`~*_\-–—…]+$/.test(value);
}

function isStrictlyIgnorableText(value) {
  const trimmed = value.trim();
  return unchangedStrictValues.has(trimmed) || isPunctuationOnly(trimmed);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, file)} is not valid JSON: ${error.message}`);
  }
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.keys(value).flatMap(key => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
}

function findBalancedObject(text, exportName) {
  const marker = `export const ${exportName}`;
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const braceStart = text.indexOf('{', start);
  if (braceStart === -1) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
  }
  return '';
}

function readStringLiteralAt(text, index) {
  const quote = text[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let out = '';
  let escaped = false;
  for (let i = index + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === quote) return { value: out, end: i + 1 };
    out += ch;
  }
  return null;
}

function extractEntryNames(objectText) {
  const names = [];
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < objectText.length; i += 1) {
    const ch = objectText[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { depth -= 1; continue; }
    if (depth !== 1) continue;
    const match = objectText.slice(i).match(/^\s*([A-Za-z0-9_$]+)\s*:/);
    if (match) {
      names.push({ key: match[1], index: i + match[0].length });
      i += match[0].length - 1;
    }
  }
  return names;
}

function findEntryBody(objectText, entry) {
  const braceStart = objectText.indexOf('{', entry.index);
  if (braceStart === -1) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = braceStart; i < objectText.length; i += 1) {
    const ch = objectText[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return objectText.slice(braceStart, i + 1);
    }
  }
  return '';
}

function prefixForExport(exportName) {
  return {
    MOVE_DEFS: 'moves',
    WEAPON_DEFS: 'weapons',
    ITEM_DEFS: 'items',
    SCROLL_DEFS: 'scrolls',
    DIFFICULTY_DEFS: 'difficulties',
    CHALLENGE_DEFS: 'challenges',
    LEGACY_UPGRADE_DEFS: 'legacy',
    CHARACTER_DEFS: 'characters',
    STATUS_STYLES: 'status',
  }[exportName] || exportName;
}

function collectRequiredContentKeys() {
  const keys = [];
  sourceFiles.forEach(({ file, exports }) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    exports.forEach(exportName => {
      const objectText = findBalancedObject(text, exportName);
      if (!objectText) return;
      const prefix = prefixForExport(exportName);
      extractEntryNames(objectText).forEach(entry => {
        const body = findEntryBody(objectText, entry);
        localizableFields.forEach(field => {
          const pattern = new RegExp(`\\b${field}\\s*:\\s*(['"\`])`);
          const match = pattern.exec(body);
          if (!match) return;
          const literal = readStringLiteralAt(body, match.index + match[0].length - 1);
          if (literal?.value?.trim()) keys.push(`${prefix}.${entry.key}.${field}`);
        });
      });
    });
  });
  return [...new Set(keys)].sort();
}

const files = fs.readdirSync(localeDir)
  .filter(file => file.endsWith('.json'))
  .sort();

if (!files.includes(`${sourceLocale}.json`)) {
  throw new Error(`Missing source locale assets/i18n/${sourceLocale}.json`);
}

const source = readJson(path.join(localeDir, `${sourceLocale}.json`));
const sourceKeys = flattenKeys(source).filter(Boolean).sort();
let failed = false;

const sourceKeySet = new Set(sourceKeys);
const missingContentKeys = collectRequiredContentKeys().filter(key => !sourceKeySet.has(key));
if (missingContentKeys.length) {
  failed = true;
  console.error('i18n: source locale is missing game-content keys. Run npm run i18n:sync.');
  console.error(`  missing: ${missingContentKeys.join(', ')}`);
}
const i18nAttrPattern = /data-i18n(?:-[a-z-]+)?=["']([^"']+)["']/g;
const markedFiles = ['index.html'];
markedFiles.forEach(file => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of text.matchAll(i18nAttrPattern)) {
    if (!sourceKeySet.has(match[1])) {
      failed = true;
      console.error(`i18n: ${file} references missing key ${match[1]}`);
    }
  }
});

files.forEach(file => {
  const locale = file.replace(/\.json$/, '');
  const dict = readJson(path.join(localeDir, file));
  const keys = flattenKeys(dict).filter(Boolean).sort();
  const missing = sourceKeys.filter(key => !keys.includes(key));
  const extra = keys.filter(key => !sourceKeys.includes(key));

  if (missing.length || extra.length) {
    failed = true;
    console.error(`i18n: ${locale} does not match ${sourceLocale}`);
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (extra.length) console.error(`  extra: ${extra.join(', ')}`);
  }
  if (strict && locale !== sourceLocale) {
    const markerValues = sourceKeys.filter(key => {
      const localeValue = dict[key];
      return typeof localeValue === 'string' && /\[[a-z]{2}\]/i.test(localeValue);
    });
    if (markerValues.length) {
      failed = true;
      console.error(`i18n: ${locale} has generated locale markers`);
      console.error(`  markers: ${markerValues.slice(0, 80).join(', ')}${markerValues.length > 80 ? ` ... +${markerValues.length - 80} more` : ''}`);
    }
    const untranslated = sourceKeys.filter(key => {
      const sourceValue = source[key];
      const localeValue = dict[key];
      if (typeof sourceValue !== 'string' || typeof localeValue !== 'string') return false;
      if (!sourceValue.trim()) return false;
      if (isStrictlyIgnorableText(sourceValue)) return false;
      return localeValue.trim() === sourceValue.trim();
    });
    if (untranslated.length) {
      failed = true;
      console.error(`i18n: ${locale} has untranslated English fallback values`);
      console.error(`  untranslated: ${untranslated.slice(0, 80).join(', ')}${untranslated.length > 80 ? ` ... +${untranslated.length - 80} more` : ''}`);
    }
  }
});

if (failed) process.exit(1);
console.log(`i18n: ${files.length} locale files match ${sourceLocale} (${sourceKeys.length} keys)`);
