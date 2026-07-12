const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const localeDir = path.join(root, 'assets', 'i18n');
const sourceFiles = [
  { file: 'js/ui/input.js', exports: ['MOVE_DEFS', 'WEAPON_DEFS', 'ITEM_DEFS', 'SCROLL_DEFS'] },
  { file: 'js/core/game-core.js', exports: ['DIFFICULTY_DEFS', 'CHALLENGE_DEFS', 'LEGACY_UPGRADE_DEFS', 'CHARACTER_DEFS', 'STATUS_STYLES'] },
];
const fields = ['name', 'shortName', 'label', 'title', 'subtitle', 'description', 'desc'];

function findBalancedObject(text, exportName, options = {}) {
  const marker = options.constOnly ? `const ${exportName}` : `export const ${exportName}`;
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

function findBalancedArray(text, constName, options = {}) {
  const marker = options.exportConst ? `export const ${constName}` : `const ${constName}`;
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const bracketStart = text.indexOf('[', start);
  if (bracketStart === -1) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bracketStart; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(bracketStart, i + 1);
    }
  }
  return '';
}

function extractRawArrayObjectBlocks(arrayText) {
  const entries = [];
  let objectDepth = 0;
  let arrayDepth = 0;
  let quote = '';
  let escaped = false;
  let objectStart = -1;
  for (let i = 0; i < arrayText.length; i += 1) {
    const ch = arrayText[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') { arrayDepth += 1; continue; }
    if (ch === ']') { arrayDepth -= 1; continue; }
    if (ch === '{') {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = i;
      objectDepth += 1;
    } else if (ch === '}') {
      objectDepth -= 1;
      if (arrayDepth === 1 && objectDepth === 0 && objectStart !== -1) {
        entries.push(arrayText.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }
  return entries;
}

function readStringLiteralAt(text, index) {
  const quote = text[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let out = '';
  let escaped = false;
  for (let i = index + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch;
      escaped = false;
      continue;
    }
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

function extractFields(body) {
  const out = {};
  fields.forEach(field => {
    const pattern = new RegExp(`\\b${field}\\s*:\\s*(['"\`])`);
    const match = pattern.exec(body);
    if (!match) return;
    const literal = readStringLiteralAt(body, match.index + match[0].length - 1);
    if (literal?.value?.trim()) out[field] = literal.value;
  });
  return out;
}

function extractObjectLiteralFields(body) {
  const out = {};
  const idMatch = /\bid\s*:\s*(['"`])/.exec(body);
  if (idMatch) out.id = readStringLiteralAt(body, idMatch.index + idMatch[0].length - 1)?.value;
  const keyMatch = /\bkey\s*:\s*(['"`])/.exec(body);
  if (keyMatch) out.key = readStringLiteralAt(body, keyMatch.index + keyMatch[0].length - 1)?.value;
  [...fields, 'speaker', 'text'].forEach(field => {
    const pattern = new RegExp(`\\b${field}\\s*:\\s*(['"\`])`);
    const match = pattern.exec(body);
    if (!match) return;
    const literal = readStringLiteralAt(body, match.index + match[0].length - 1);
    if (literal?.value?.trim()) out[field] = literal.value;
  });
  return out;
}

function extractArrayObjects(arrayText) {
  const entries = [];
  let objectDepth = 0;
  let arrayDepth = 0;
  let quote = '';
  let escaped = false;
  let objectStart = -1;
  for (let i = 0; i < arrayText.length; i += 1) {
    const ch = arrayText[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') { arrayDepth += 1; continue; }
    if (ch === ']') { arrayDepth -= 1; continue; }
    if (ch === '{') {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = i;
      objectDepth += 1;
    } else if (ch === '}') {
      objectDepth -= 1;
      if (arrayDepth === 1 && objectDepth === 0 && objectStart !== -1) {
        entries.push(extractObjectLiteralFields(arrayText.slice(objectStart, i + 1)));
        objectStart = -1;
      }
    }
  }
  return entries;
}

function extractNamedObjectBlocks(objectText) {
  return extractEntryNames(objectText).map(entry => ({
    key: entry.key,
    body: findEntryBody(objectText, entry),
  }));
}

function extractLineObjects(linesText) {
  return extractArrayObjects(linesText).map(({ speaker, text }) => ({ speaker, text }));
}

function extractPrimitiveObjectEntries(objectText) {
  const out = {};
  extractEntryNames(objectText).forEach(entry => {
    const literalStart = objectText.slice(entry.index).search(/['"`]/);
    if (literalStart === -1) return;
    const literal = readStringLiteralAt(objectText, entry.index + literalStart);
    if (literal?.value?.trim()) out[entry.key] = literal.value;
  });
  return out;
}

function findPropertyArray(body, propertyName) {
  const prop = body.indexOf(`${propertyName}:`);
  if (prop === -1) return '';
  const start = body.indexOf('[', prop);
  if (start === -1) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return body.slice(start, i + 1);
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

function collectContentKeys() {
  const collected = {};
  sourceFiles.forEach(({ file, exports }) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    exports.forEach(exportName => {
      const objectText = findBalancedObject(text, exportName);
      if (!objectText) return;
      const prefix = prefixForExport(exportName);
      extractEntryNames(objectText).forEach(entry => {
        const values = extractFields(findEntryBody(objectText, entry));
        Object.entries(values).forEach(([field, value]) => {
          collected[`${prefix}.${entry.key}.${field}`] = value;
        });
      });
    });
  });
  const achievementsText = fs.readFileSync(path.join(root, 'js/achievements.js'), 'utf8');
  const achievementsArray = findBalancedArray(achievementsText, 'ACHIEVEMENTS');
  extractArrayObjects(achievementsArray).forEach(entry => {
    if (!entry.id) return;
    ['name', 'desc'].forEach(field => {
      if (entry[field]) collected[`achievements.${entry.id}.${field}`] = entry[field];
    });
  });
  const progressObject = findBalancedObject(achievementsText, 'ACHIEVEMENT_PROGRESS', { constOnly: true });
  extractEntryNames(progressObject).forEach(entry => {
    const values = extractFields(findEntryBody(progressObject, entry));
    if (values.label) collected[`achievementProgress.${entry.key}.label`] = values.label;
  });
  const sfxText = fs.readFileSync(path.join(root, 'js/core/sfx.js'), 'utf8');
  const soundObject = findBalancedObject(sfxText, 'SOUND_META', { constOnly: true });
  const categories = new Set();
  extractEntryNames(soundObject).forEach(entry => {
    const values = extractFields(findEntryBody(soundObject, entry));
    if (values.label) collected[`sounds.${entry.key}.label`] = values.label;
    if (values.category) categories.add(values.category);
  });
  categories.add('Other');
  categories.forEach(category => { collected[`soundCategories.${category}`] = category; });
  const tutorialText = fs.readFileSync(path.join(root, 'js/tutorial/scenes.js'), 'utf8');
  const tutorialObject = findBalancedObject(tutorialText, 'TUTORIAL_SCENES');
  extractNamedObjectBlocks(tutorialObject).forEach(scene => {
    extractLineObjects(findPropertyArray(scene.body, 'lines')).forEach((line, index) => {
      if (line.speaker) collected[`tutorial.${scene.key}.lines.${index}.speaker`] = line.speaker;
      if (line.text) collected[`tutorial.${scene.key}.lines.${index}.text`] = line.text;
    });
  });
  const coreText = fs.readFileSync(path.join(root, 'js/core/game-core.js'), 'utf8');
  Object.entries(extractPrimitiveObjectEntries(findBalancedObject(coreText, 'GOD_PHASE_DIALOGUE'))).forEach(([key, value]) => {
    collected[`godPhaseDialogue.${key}`] = value;
  });
  Object.entries(extractPrimitiveObjectEntries(findBalancedObject(coreText, 'BOSS_OPENING_DIALOGUE'))).forEach(([key, value]) => {
    collected[`bossOpeningDialogue.${key}`] = value;
  });
  const cutsceneArray = findBalancedArray(coreText, 'CUTSCENE_GALLERY', { exportConst: true });
  extractRawArrayObjectBlocks(cutsceneArray).forEach(sceneBody => {
    const scene = extractObjectLiteralFields(sceneBody);
    if (!scene.id) return;
    if (scene.title) collected[`cutscenes.${scene.id}.title`] = scene.title;
    if (scene.subtitle) collected[`cutscenes.${scene.id}.subtitle`] = scene.subtitle;
    extractLineObjects(findPropertyArray(sceneBody, 'lines')).forEach((line, index) => {
      if (line.speaker) collected[`cutscenes.${scene.id}.lines.${index}.speaker`] = line.speaker;
      if (line.text) collected[`cutscenes.${scene.id}.lines.${index}.text`] = line.text;
    });
  });
  const controllerText = fs.readFileSync(path.join(root, 'js/ui/controller.js'), 'utf8');
  const enemyInfoArray = findBalancedArray(controllerText, 'ENEMY_INFO');
  extractArrayObjects(enemyInfoArray).forEach(enemy => {
    if (!enemy.key) return;
    if (enemy.label) collected[`enemyInfo.${enemy.key}.label`] = enemy.label;
    if (enemy.desc) collected[`enemyInfo.${enemy.key}.desc`] = enemy.desc;
  });
  return collected;
}

const contentKeys = collectContentKeys();
const localeFiles = fs.readdirSync(localeDir).filter(file => file.endsWith('.json')).sort();
const enPath = path.join(localeDir, 'en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
Object.entries(contentKeys).forEach(([key, value]) => {
  if (en[key] == null) en[key] = value;
});
fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);

localeFiles.filter(file => file !== 'en.json').forEach(file => {
  const filePath = path.join(localeDir, file);
  const locale = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  Object.keys(en).forEach(key => {
    if (locale[key] == null) locale[key] = en[key];
  });
  Object.keys(locale).forEach(key => {
    if (en[key] == null) delete locale[key];
  });
  fs.writeFileSync(filePath, `${JSON.stringify(locale, null, 2)}\n`);
});

console.log(`i18n sync: ${Object.keys(contentKeys).length} game-content keys covered`);
