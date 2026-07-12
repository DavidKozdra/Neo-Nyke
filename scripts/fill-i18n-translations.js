const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const localeDir = path.join(root, 'assets', 'i18n');
const source = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8'));

const localeTargets = {
  ar: 'ar',
  de: 'de',
  es: 'es',
  fr: 'fr',
  hi: 'hi',
  id: 'id',
  ja: 'ja',
  ko: 'ko',
  pt: 'pt',
  ru: 'ru',
  tr: 'tr',
  zh: 'zh-CN',
};

const manualValues = {
  ar: {
    SARGE: 'الرقيب',
    THORN: 'ثورن',
    KNAVE: 'المخادع',
    QUEEN: 'الملكة',
    METAO: 'ميتاو',
    GOD: 'الله',
    PRINCESS: 'الأميرة',
    GELLEH: 'غيليه',
    MOOGGY: 'موغي',
    'BULK GOLEM': 'الغولم الضخم',
    'RIVAL PRINCESS': 'الأميرة المنافسة',
    'HANDSOME DEVIL': 'الشيطان الوسيم',
    'ANTONY BLEMMYE': 'أنتوني بليمي',
    'BOWMAN BANE': 'لعنة الرامي',
  },
  de: {
    SARGE: 'Feldwebel',
    THORN: 'Dorn',
    KNAVE: 'Schurke',
    QUEEN: 'Koenigin',
    METAO: 'Metao',
    GOD: 'Gott',
    PRINCESS: 'Prinzessin',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Massengolem',
    'RIVAL PRINCESS': 'Rivalin-Prinzessin',
    'HANDSOME DEVIL': 'Schoener Teufel',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': 'Bogens Fluch',
  },
  es: {
    SARGE: 'Sargento',
    THORN: 'Espina',
    KNAVE: 'Bribon',
    QUEEN: 'Reina',
    METAO: 'Metao',
    GOD: 'Dios',
    PRINCESS: 'Princesa',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Golem enorme',
    'RIVAL PRINCESS': 'Princesa rival',
    'HANDSOME DEVIL': 'Diablo apuesto',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': 'Azote del arquero',
  },
  fr: {
    SARGE: 'Sergent',
    THORN: 'Epine',
    KNAVE: 'Fripon',
    QUEEN: 'Reine',
    METAO: 'Metao',
    GOD: 'Dieu',
    PRINCESS: 'Princesse',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Golem massif',
    'RIVAL PRINCESS': 'Princesse rivale',
    'HANDSOME DEVIL': 'Beau diable',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': "Fleau de l'archer",
  },
  hi: {
    SARGE: 'सार्जेंट',
    THORN: 'थॉर्न',
    KNAVE: 'धूर्त',
    QUEEN: 'रानी',
    METAO: 'मेटाओ',
    GOD: 'ईश्वर',
    PRINCESS: 'राजकुमारी',
    GELLEH: 'गेलेह',
    MOOGGY: 'मूगी',
    'BULK GOLEM': 'विशाल गोलेम',
    'RIVAL PRINCESS': 'प्रतिद्वंद्वी राजकुमारी',
    'HANDSOME DEVIL': 'सुंदर शैतान',
    'ANTONY BLEMMYE': 'एंटनी ब्लेमी',
    'BOWMAN BANE': 'धनुर्धर का अभिशाप',
  },
  id: {
    SARGE: 'Sersan',
    THORN: 'Duri',
    KNAVE: 'Bajingan',
    QUEEN: 'Ratu',
    METAO: 'Metao',
    GOD: 'Tuhan',
    PRINCESS: 'Putri',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Golem raksasa',
    'RIVAL PRINCESS': 'Putri saingan',
    'HANDSOME DEVIL': 'Iblis tampan',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': 'Kutukan pemanah',
  },
  ja: {
    SARGE: '軍曹',
    THORN: 'ソーン',
    KNAVE: '悪漢',
    QUEEN: '女王',
    METAO: 'メタオ',
    GOD: '神',
    PRINCESS: '姫',
    GELLEH: 'ゲレ',
    MOOGGY: 'ムーギー',
    'BULK GOLEM': '巨大ゴーレム',
    'RIVAL PRINCESS': 'ライバル姫',
    'HANDSOME DEVIL': '美形の悪魔',
    'ANTONY BLEMMYE': 'アントニー・ブレミー',
    'BOWMAN BANE': '弓兵の災厄',
  },
  ko: {
    SARGE: '상사',
    THORN: '쏜',
    KNAVE: '악한',
    QUEEN: '여왕',
    METAO: '메타오',
    GOD: '신',
    PRINCESS: '공주',
    GELLEH: '겔레',
    MOOGGY: '무기',
    'BULK GOLEM': '거대 골렘',
    'RIVAL PRINCESS': '경쟁 공주',
    'HANDSOME DEVIL': '잘생긴 악마',
    'ANTONY BLEMMYE': '앤터니 블레미',
    'BOWMAN BANE': '궁수의 재앙',
  },
  pt: {
    SARGE: 'Sargento',
    THORN: 'Espinho',
    KNAVE: 'Patife',
    QUEEN: 'Rainha',
    METAO: 'Metao',
    GOD: 'Deus',
    PRINCESS: 'Princesa',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Golem enorme',
    'RIVAL PRINCESS': 'Princesa rival',
    'HANDSOME DEVIL': 'Diabo bonito',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': 'Flagelo do arqueiro',
  },
  ru: {
    SARGE: 'Сержант',
    THORN: 'Торн',
    KNAVE: 'Плут',
    QUEEN: 'Королева',
    METAO: 'Метао',
    GOD: 'Бог',
    PRINCESS: 'Принцесса',
    GELLEH: 'Гелле',
    MOOGGY: 'Мугги',
    'BULK GOLEM': 'Огромный голем',
    'RIVAL PRINCESS': 'Принцесса-соперница',
    'HANDSOME DEVIL': 'Красивый дьявол',
    'ANTONY BLEMMYE': 'Энтони Блемми',
    'BOWMAN BANE': 'Проклятие лучника',
  },
  tr: {
    SARGE: 'Cavus',
    THORN: 'Diken',
    KNAVE: 'Düzenbaz',
    QUEEN: 'Kraliçe',
    METAO: 'Metao',
    GOD: 'Tanri',
    PRINCESS: 'Prenses',
    GELLEH: 'Gelleh',
    MOOGGY: 'Mooggy',
    'BULK GOLEM': 'Dev golem',
    'RIVAL PRINCESS': 'Rakip prenses',
    'HANDSOME DEVIL': 'Yakışıklı şeytan',
    'ANTONY BLEMMYE': 'Antony Blemmye',
    'BOWMAN BANE': 'Okçunun belası',
  },
  zh: {
    SARGE: '中士',
    THORN: '荆棘',
    KNAVE: '无赖',
    QUEEN: '女王',
    METAO: '梅塔奥',
    GOD: '神',
    PRINCESS: '公主',
    GELLEH: '盖勒',
    MOOGGY: '穆吉',
    'BULK GOLEM': '巨型魔像',
    'RIVAL PRINCESS': '宿敌公主',
    'HANDSOME DEVIL': '英俊恶魔',
    'ANTONY BLEMMYE': '安东尼·布莱米',
    'BOWMAN BANE': '弓手灾星',
  },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkEntries(entries, maxChars = 4200) {
  const chunks = [];
  let current = [];
  let size = 0;
  entries.forEach(entry => {
    const nextSize = size + entry.value.length + 32;
    if (current.length && nextSize > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entry.value.length + 32;
  });
  if (current.length) chunks.push(current);
  return chunks;
}

async function translate(text, target) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translate ${target} failed with HTTP ${res.status}`);
  const data = await res.json();
  return data[0].map(part => part[0]).join('');
}

async function translateWithRetry(text, target) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await translate(text, target);
    } catch (error) {
      lastError = error;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastError;
}

async function translateChunk(entries, target) {
  const markers = entries.map((_, index) => `ZZZNEONYKE${String(index).padStart(3, '0')}ZZZ`);
  const text = entries.map((entry, index) => `${markers[index]}\n${entry.value}`).join('\n');
  const translated = await translateWithRetry(text, target);
  return entries.map((entry, index) => {
    const marker = markers[index];
    const nextMarker = markers[index + 1];
    const start = translated.indexOf(marker);
    const end = nextMarker ? translated.indexOf(nextMarker) : translated.length;
    if (start === -1 || end === -1 || end <= start) {
      return { key: entry.key, value: null };
    }
    return {
      key: entry.key,
      value: translated.slice(start + marker.length, end).trim(),
    };
  });
}

function needsTranslation(localeValue, sourceValue) {
  return typeof sourceValue === 'string'
    && sourceValue.trim()
    && (typeof localeValue !== 'string' || !localeValue.trim() || localeValue.trim() === sourceValue.trim());
}

function fallbackValue(locale, key, sourceValue) {
  const manual = manualValues[locale]?.[sourceValue.trim()];
  if (manual) return manual;
  return null;
}

async function fillLocale(locale, target) {
  const file = path.join(localeDir, `${locale}.json`);
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(source).filter(key => needsTranslation(dict[key], source[key]));
  const remoteEntries = [];
  let changed = 0;

  for (const key of keys) {
    const base = source[key];
    const manual = fallbackValue(locale, key, base);
    if (manual) {
      dict[key] = manual;
      changed += 1;
      continue;
    }
    remoteEntries.push({ key, value: base });
  }

  for (const chunk of chunkEntries(remoteEntries)) {
    const translatedEntries = await translateChunk(chunk, target);
    translatedEntries.forEach(({ key, value }) => {
      const base = source[key];
      dict[key] = value || base;
      changed += 1;
    });
    await sleep(150);
  }

  fs.writeFileSync(file, `${JSON.stringify(dict, null, 2)}\n`);
  console.log(`${locale}: filled ${changed} values`);
}

(async () => {
  for (const [locale, target] of Object.entries(localeTargets)) {
    await fillLocale(locale, target);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
