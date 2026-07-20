(function I18n() {
  const SUPPORTED_LANGUAGES = [
    { code: 'system', labelKey: 'settings.language.system' },
    { code: 'en', labelKey: 'settings.language.english' },
    { code: 'es', labelKey: 'settings.language.spanish' },
    { code: 'fr', labelKey: 'settings.language.french' },
    { code: 'de', labelKey: 'settings.language.german' },
    { code: 'ja', labelKey: 'settings.language.japanese' },
    { code: 'zh', labelKey: 'settings.language.chinese' },
    { code: 'pt', labelKey: 'settings.language.portuguese' },
    { code: 'hi', labelKey: 'settings.language.hindi' },
    { code: 'ar', labelKey: 'settings.language.arabic' },
    { code: 'ru', labelKey: 'settings.language.russian' },
    { code: 'ko', labelKey: 'settings.language.korean' },
    { code: 'id', labelKey: 'settings.language.indonesian' },
    { code: 'tr', labelKey: 'settings.language.turkish' },
  ];
  const DEFAULT_LANGUAGE = 'en';
  const dictionaries = {};
  const baseTextNodes = new WeakMap();
  let sourcePhraseKeys = null;
  let currentLanguage = DEFAULT_LANGUAGE;
  let observer = null;

  function normalizeLanguage(code) {
    const raw = String(code || '').trim().toLowerCase();
    if (!raw || raw === 'system') return 'system';
    const base = raw.startsWith('zh') ? 'zh' : raw.split('-')[0];
    return SUPPORTED_LANGUAGES.some(lang => lang.code === base) ? base : DEFAULT_LANGUAGE;
  }

  function resolveLanguage(code) {
    const normalized = normalizeLanguage(code);
    if (normalized !== 'system') return normalized;
    const browser = normalizeLanguage(navigator.language || navigator.userLanguage || DEFAULT_LANGUAGE);
    return browser === 'system' ? DEFAULT_LANGUAGE : browser;
  }

  async function loadLanguage(language) {
    const resolved = resolveLanguage(language);
    if (dictionaries[resolved]) return dictionaries[resolved];
    // Plain fetch (no `cache: 'no-store'`): the service worker precaches every
    // locale and owns freshness (network-first for code, message-driven refresh
    // for assets). `no-store` forced a network hit and could bypass the SW cache
    // match, so the UI failed to translate offline. Let the SW serve the cached
    // copy when there is no network.
    const response = await fetch(`assets/i18n/${resolved}.json`);
    if (!response.ok) throw new Error(`Could not load language ${resolved}`);
    dictionaries[resolved] = await response.json();
    return dictionaries[resolved];
  }

  function translate(key) {
    const dict = dictionaries[currentLanguage] || {};
    const fallback = dictionaries[DEFAULT_LANGUAGE] || {};
    return dict[key] || fallback[key] || key;
  }

  function translateOptional(key, fallbackText) {
    const dict = dictionaries[currentLanguage] || {};
    const fallback = dictionaries[DEFAULT_LANGUAGE] || {};
    return dict[key] || fallback[key] || fallbackText;
  }

  function sourceTextKey(text) {
    if (!sourcePhraseKeys) {
      sourcePhraseKeys = new Map();
      Object.entries(dictionaries[DEFAULT_LANGUAGE] || {}).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim()) sourcePhraseKeys.set(value, key);
      });
    }
    return sourcePhraseKeys.get(String(text || '').trim());
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = translate(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', translate(el.dataset.i18nAriaLabel));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', translate(el.dataset.i18nPlaceholder));
    });
    const walkerRoot = root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    if (!walkerRoot) return;
    const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea, input, select, option')) return NodeFilter.FILTER_REJECT;
        return baseTextNodes.has(node) || sourceTextKey(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const baseText = baseTextNodes.get(node) || node.nodeValue.trim();
      if (!baseTextNodes.has(node)) baseTextNodes.set(node, baseText);
      const key = sourceTextKey(baseText);
      if (key) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translate(key));
    });
  }

  function observe() {
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.('[data-i18n], [data-i18n-aria-label], [data-i18n-placeholder]')) apply(node.parentElement || document);
          else if (node.querySelector?.('[data-i18n], [data-i18n-aria-label], [data-i18n-placeholder]')) apply(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function localizeDefBag(bag, prefix) {
    if (!bag || typeof bag !== 'object') return;
    Object.entries(bag).forEach(([key, def]) => {
      if (!def || typeof def !== 'object') return;
      if (!def.__i18nBase) {
        Object.defineProperty(def, '__i18nBase', {
          value: {
            name: def.name,
            shortName: def.shortName,
            label: def.label,
            title: def.title,
            subtitle: def.subtitle,
            description: def.description,
            desc: def.desc,
          },
          enumerable: false,
        });
      }
      const base = def.__i18nBase;
      ['name', 'shortName', 'label', 'title', 'subtitle', 'description', 'desc'].forEach(field => {
        if (base[field] == null) return;
        def[field] = translateOptional(`${prefix}.${key}.${field}`, base[field]);
      });
    });
  }

  function localizePrimitiveMap(map, prefix) {
    if (!map || typeof map !== 'object') return;
    Object.keys(map).forEach(key => {
      const value = map[key];
      if (typeof value !== 'string') return;
      if (!Object.prototype.hasOwnProperty.call(map, '__i18nBase')) {
        Object.defineProperty(map, '__i18nBase', { value: {}, enumerable: false });
      }
      if (map.__i18nBase[key] == null) map.__i18nBase[key] = value;
      map[key] = translateOptional(`${prefix}.${key}`, map.__i18nBase[key]);
    });
  }

  function localizeLineArray(lines, prefix) {
    if (!Array.isArray(lines)) return;
    lines.forEach((line, index) => {
      if (!line || typeof line !== 'object') return;
      if (!line.__i18nBase) {
        Object.defineProperty(line, '__i18nBase', {
          value: { speaker: line.speaker, text: line.text },
          enumerable: false,
        });
      }
      const base = line.__i18nBase;
      if (base.speaker != null) line.speaker = translateOptional(`${prefix}.lines.${index}.speaker`, base.speaker);
      if (base.text != null) {
        const direct = translateOptional(`${prefix}.lines.${index}.text`, null);
        const phraseKey = sourceTextKey(base.text);
        line.text = direct || (phraseKey ? translate(phraseKey) : base.text);
      }
    });
  }

  function localizeTutorialScenes(scenes) {
    if (!scenes || typeof scenes !== 'object') return;
    Object.entries(scenes).forEach(([sceneId, scene]) => {
      localizeLineArray(scene?.lines, `tutorial.${sceneId}`);
    });
  }

  function localizeCutsceneGallery(gallery) {
    if (!Array.isArray(gallery)) return;
    gallery.forEach(scene => {
      if (!scene?.id) return;
      if (!scene.__i18nBase) {
        Object.defineProperty(scene, '__i18nBase', {
          value: { title: scene.title, subtitle: scene.subtitle },
          enumerable: false,
        });
      }
      const base = scene.__i18nBase;
      if (base.title != null) scene.title = translateOptional(`cutscenes.${scene.id}.title`, base.title);
      if (base.subtitle != null) scene.subtitle = translateOptional(`cutscenes.${scene.id}.subtitle`, base.subtitle);
      localizeLineArray(scene.lines, `cutscenes.${scene.id}`);
    });
  }

  function localizeNeo(neo = window.Neo) {
    if (!neo) return;
    localizeDefBag(neo.MOVE_DEFS, 'moves');
    localizeDefBag(neo.WEAPON_DEFS, 'weapons');
    localizeDefBag(neo.ITEM_DEFS, 'items');
    localizeDefBag(neo.SCROLL_DEFS, 'scrolls');
    localizeDefBag(neo.CHARACTER_DEFS, 'characters');
    localizeDefBag(neo.DIFFICULTY_DEFS, 'difficulties');
    localizeDefBag(neo.CHALLENGE_DEFS, 'challenges');
    localizeDefBag(neo.LEGACY_UPGRADE_DEFS, 'legacy');
    localizeDefBag(neo.SPECIAL_ROOM_DEFS, 'specialRooms');
    localizeDefBag(neo.ENEMY_INFO, 'enemyInfo');
    localizePrimitiveMap(neo.GOD_PHASE_DIALOGUE, 'godPhaseDialogue');
    localizePrimitiveMap(neo.BOSS_OPENING_DIALOGUE, 'bossOpeningDialogue');
    localizeDefBag(window.ACHIEVEMENTS, 'achievements');
    localizeDefBag(window.ACHIEVEMENT_PROGRESS, 'achievementProgress');
    localizeCutsceneGallery(neo.CUTSCENE_GALLERY);
    if (window.NeoTutorialScenes) localizeTutorialScenes(window.NeoTutorialScenes);
    neo.refreshMenuState?.();
    if (neo.isPanelOpen?.(neo.ui?.shopPanel)) neo.renderShopPanel?.();
    if (neo.isPanelOpen?.(neo.ui?.invPanel)) neo.renderInventoryPanel?.();
    if (neo.isPanelOpen?.(neo.ui?.anvilPanel)) neo.renderAnvilPanel?.();
    if (neo.isPanelOpen?.(document.getElementById('specialRoomPanel'))) neo.renderSpecialRoomPanel?.();
    neo.renderPlayerStatsPanel?.();
    window.dispatchEvent(new CustomEvent('neo:i18n-game-data', { detail: { language: currentLanguage } }));
  }

  async function setLanguage(language) {
    currentLanguage = resolveLanguage(language);
    await loadLanguage(DEFAULT_LANGUAGE);
    await loadLanguage(currentLanguage);
    sourcePhraseKeys = null;
    document.documentElement.lang = currentLanguage;
    apply();
    localizeNeo();
    observe();
    window.dispatchEvent(new CustomEvent('neo:i18n-ready', { detail: { language: currentLanguage } }));
  }

  window.NeoI18n = {
    supportedLanguages: SUPPORTED_LANGUAGES,
    normalizeLanguage,
    resolveLanguage,
    loadLanguage,
    setLanguage,
    apply,
    localizeNeo,
    localizeTutorialScenes,
    localizeCutsceneGallery,
    t: translate,
    tOptional: translateOptional,
    getLanguage: () => currentLanguage,
  };
})();
