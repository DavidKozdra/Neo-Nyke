// custom-sprite-editor.js — user-facing 8×4 character sheet editor and storage.

(() => {
  const DB_NAME = 'NeoNykeDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'saves';
  const RECORD_PREFIX = 'custom-sprite:';
  const LOCAL_PREFIX = 'neonyke:custom-sprite:';
  const TEMPLATE_SRC = 'assets/sprites/chars/Thorn Knight.png';
  const COLUMNS = 8;
  const ROWS = 4;
  const MAX_HISTORY = 24;
  const AUTOSAVE_DELAY_MS = 700;

  const master = document.createElement('canvas');
  const masterCtx = master.getContext('2d', { willReadFrequently: true });
  masterCtx.imageSmoothingEnabled = false;

  const state = {
    key: '',
    openToken: 0,
    dirty: false,
    revision: 0,
    history: [],
    future: [],
    tool: 'brush',
    brushColor: '#ef3340',
    brushSize: 1,
    zoom: 3,
    drawing: false,
    lastPoint: null,
    beforeStroke: null,
    saveTimer: null,
    savePromise: null,
    previewTimer: null,
    previewFrame: 0,
  };

  let templatePromise = null;
  let elements = null;

  function getElements() {
    if (elements) return elements;
    elements = {
      panel: document.getElementById('customCharacterPanel'),
      display: document.getElementById('customSpriteCanvas'),
      preview: document.getElementById('customSpritePreview'),
      color: document.getElementById('customSpriteColor'),
      brush: document.getElementById('customSpriteBrush'),
      eraser: document.getElementById('customSpriteEraser'),
      picker: document.getElementById('customSpritePicker'),
      size: document.getElementById('customSpriteBrushSize'),
      zoom: document.getElementById('customSpriteZoom'),
      undo: document.getElementById('customSpriteUndo'),
      redo: document.getElementById('customSpriteRedo'),
      restore: document.getElementById('customSpriteRestore'),
      upload: document.getElementById('customSpriteUpload'),
      uploadInput: document.getElementById('customSpriteUploadInput'),
      download: document.getElementById('customSpriteDownload'),
      save: document.getElementById('customSpriteSave'),
      status: document.getElementById('customSpriteStatus'),
      dimensions: document.getElementById('customSpriteDimensions'),
    };
    return elements;
  }

  function setStatus(text, kind = '') {
    const status = getElements().status;
    if (!status) return;
    status.textContent = text;
    status.dataset.state = kind;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let objectUrl = '';
      image.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not decode the sprite sheet image.'));
      };
      if (source instanceof Blob) {
        objectUrl = URL.createObjectURL(source);
        image.src = objectUrl;
      } else {
        image.src = source;
      }
    });
  }

  function loadTemplate() {
    if (!templatePromise) templatePromise = loadImage(TEMPLATE_SRC);
    return templatePromise;
  }

  function validateDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < COLUMNS || height < ROWS) {
      throw new Error('Sprite sheet dimensions are invalid.');
    }
    if (width % COLUMNS !== 0 || height % ROWS !== 0) {
      throw new Error('Sprite sheets must contain exactly 8 columns and 4 rows of equal-size frames.');
    }
    if (width > 2048 || height > 2048) {
      throw new Error('Sprite sheets cannot be larger than 2048×2048 pixels.');
    }
  }

  function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        if (!db.objectStoreNames.contains('achievements')) db.createObjectStore('achievements', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('Could not open sprite storage.'));
    });
  }

  function runStore(mode, operation) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        const error = transaction.error || new Error('Sprite storage transaction failed.');
        db.close();
        reject(error);
      };
      transaction.onabort = transaction.onerror;
    }));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Could not encode sprite sheet.'));
      reader.readAsDataURL(blob);
    });
  }

  async function persistBlob(characterKey, blob) {
    const record = {
      type: 'custom-character-sprite',
      characterKey,
      blob,
      width: master.width,
      height: master.height,
      updatedAt: Date.now(),
    };
    try {
      await runStore('readwrite', store => store.put(record, `${RECORD_PREFIX}${characterKey}`));
      try { localStorage.removeItem(`${LOCAL_PREFIX}${characterKey}`); } catch {}
      return;
    } catch {}
    const dataUrl = await blobToDataUrl(blob);
    localStorage.setItem(`${LOCAL_PREFIX}${characterKey}`, dataUrl);
  }

  async function deletePersistedBlob(characterKey) {
    try {
      await runStore('readwrite', store => store.delete(`${RECORD_PREFIX}${characterKey}`));
    } catch {}
    try { localStorage.removeItem(`${LOCAL_PREFIX}${characterKey}`); } catch {}
  }

  function readIdbRecords() {
    return openDb().then(db => new Promise((resolve, reject) => {
      const records = [];
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const range = IDBKeyRange.bound(RECORD_PREFIX, `${RECORD_PREFIX}\uffff`);
      const request = store.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value;
        if (value?.blob instanceof Blob) records.push(value);
        cursor.continue();
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(records);
      };
      transaction.onerror = () => {
        const error = transaction.error || new Error('Could not read saved sprites.');
        db.close();
        reject(error);
      };
    }));
  }

  function readLocalRecords() {
    const records = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(LOCAL_PREFIX)) continue;
        const dataUrl = localStorage.getItem(key);
        if (dataUrl) records.push({ characterKey: key.slice(LOCAL_PREFIX.length), dataUrl });
      }
    } catch {}
    return records;
  }

  function makeCustomSheetDef(width, height) {
    const template = Neo.CHARACTER_SHEET_DEFS?.thorn_knight || {};
    return {
      ...template,
      src: '',
      frameWidth: width / COLUMNS,
      frameHeight: height / ROWS,
      frameCount: COLUMNS * ROWS,
    };
  }

  async function installStoredSprite(characterKey, source, rebuild = true) {
    const image = await loadImage(source);
    validateDimensions(image.naturalWidth, image.naturalHeight);
    const def = makeCustomSheetDef(image.naturalWidth, image.naturalHeight);
    const sheet = Neo.createCharacterSheetFromImage?.(characterKey, def, image);
    if (!sheet) throw new Error('Could not create the custom character sprite sheet.');
    Neo.CHARACTER_SHEET_DEFS[characterKey] = def;
    Neo.CHARACTER_SPRITE_SHEETS = Neo.CHARACTER_SPRITE_SHEETS || {};
    Neo.CHARACTER_SPRITE_SHEETS[characterKey] = sheet;
    if (rebuild && typeof Neo.buildSpriteAtlas === 'function') {
      Neo.SPRITE_ATLAS = Neo.buildSpriteAtlas();
      Neo.invalidateSpriteTextureCache?.(characterKey);
      Neo.updateCharacterSelectionUI?.();
    }
    return sheet;
  }

  async function preloadCustomCharacterSprites() {
    const records = new Map();
    try {
      (await readIdbRecords()).forEach(record => records.set(record.characterKey, record.blob));
    } catch {}
    readLocalRecords().forEach(record => {
      if (!records.has(record.characterKey)) records.set(record.characterKey, record.dataUrl);
    });
    await Promise.all([...records].map(async ([characterKey, source]) => {
      try {
        await installStoredSprite(characterKey, source, false);
      } catch (error) {
        console.warn(`[CustomSprites] Failed to load "${characterKey}".`, error);
      }
    }));
  }

  function captureSnapshot() {
    if (!master.width || !master.height) return null;
    return {
      width: master.width,
      height: master.height,
      pixels: masterCtx.getImageData(0, 0, master.width, master.height),
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    master.width = snapshot.width;
    master.height = snapshot.height;
    masterCtx.imageSmoothingEnabled = false;
    masterCtx.putImageData(snapshot.pixels, 0, 0);
    repaint();
  }

  function updateHistoryControls() {
    const els = getElements();
    if (els.undo) els.undo.disabled = state.history.length === 0;
    if (els.redo) els.redo.disabled = state.future.length === 0;
  }

  function markChanged(before) {
    if (before) {
      state.history.push(before);
      if (state.history.length > MAX_HISTORY) state.history.shift();
      state.future.length = 0;
    }
    state.revision += 1;
    state.dirty = true;
    setStatus('Unsaved changes', 'dirty');
    updateHistoryControls();
    scheduleSave();
  }

  function frameDimensions() {
    return { width: master.width / COLUMNS, height: master.height / ROWS };
  }

  function repaintPreview() {
    const preview = getElements().preview;
    if (!preview || !master.width) return;
    const ctx = preview.getContext('2d');
    const frame = frameDimensions();
    const walkFrames = [2, 3, 4, 5, 6, 7];
    const index = walkFrames[state.previewFrame % walkFrames.length];
    const sourceX = (index % COLUMNS) * frame.width;
    const sourceY = Math.floor(index / COLUMNS) * frame.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, preview.width, preview.height);
    const scale = Math.min(preview.width / frame.width, preview.height / frame.height) * 0.84;
    const width = frame.width * scale;
    const height = frame.height * scale;
    ctx.drawImage(master, sourceX, sourceY, frame.width, frame.height, (preview.width - width) / 2, (preview.height - height) / 2, width, height);
  }

  function repaint() {
    const display = getElements().display;
    if (!display || !master.width) return;
    const zoom = Math.max(1, Number(state.zoom) || 1);
    display.width = master.width * zoom;
    display.height = master.height * zoom;
    const ctx = display.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(master, 0, 0, display.width, display.height);

    const frame = frameDimensions();
    ctx.strokeStyle = 'rgba(255, 211, 92, .72)';
    ctx.lineWidth = 1;
    for (let column = 1; column < COLUMNS; column += 1) {
      const x = column * frame.width * zoom + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, display.height);
      ctx.stroke();
    }
    for (let row = 1; row < ROWS; row += 1) {
      const y = row * frame.height * zoom + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(display.width, y);
      ctx.stroke();
    }
    if (zoom >= 6) {
      ctx.strokeStyle = 'rgba(195, 222, 245, .12)';
      for (let x = 1; x < master.width; x += 1) {
        if (x % frame.width === 0) continue;
        const px = x * zoom + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, display.height);
        ctx.stroke();
      }
      for (let y = 1; y < master.height; y += 1) {
        if (y % frame.height === 0) continue;
        const py = y * zoom + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(display.width, py);
        ctx.stroke();
      }
    }
    const dimensions = getElements().dimensions;
    if (dimensions) dimensions.textContent = `${master.width}×${master.height}px · ${frame.width}×${frame.height}px frames`;
    repaintPreview();
  }

  function setTool(tool) {
    state.tool = tool;
    const els = getElements();
    for (const [name, button] of [['brush', els.brush], ['eraser', els.eraser], ['picker', els.picker]]) {
      button?.classList.toggle('is-active', name === tool);
      button?.setAttribute('aria-pressed', name === tool ? 'true' : 'false');
    }
    if (els.display) els.display.dataset.tool = tool;
  }

  function pointerToPixel(event) {
    const display = getElements().display;
    const rect = display.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(master.width - 1, Math.floor((event.clientX - rect.left) / rect.width * master.width))),
      y: Math.max(0, Math.min(master.height - 1, Math.floor((event.clientY - rect.top) / rect.height * master.height))),
    };
  }

  function paintPixel(x, y) {
    const size = Math.max(1, Math.min(8, Number(state.brushSize) || 1));
    const offset = Math.floor((size - 1) / 2);
    if (state.tool === 'eraser') {
      masterCtx.clearRect(x - offset, y - offset, size, size);
    } else {
      masterCtx.fillStyle = state.brushColor;
      masterCtx.fillRect(x - offset, y - offset, size, size);
    }
  }

  function paintLine(from, to) {
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - x);
    const sx = x < to.x ? 1 : -1;
    const dy = -Math.abs(to.y - y);
    const sy = y < to.y ? 1 : -1;
    let error = dx + dy;
    while (true) {
      paintPixel(x, y);
      if (x === to.x && y === to.y) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }

  function pickColor(point) {
    const pixel = masterCtx.getImageData(point.x, point.y, 1, 1).data;
    if (pixel[3] === 0) return;
    const hex = `#${[pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
    state.brushColor = hex;
    if (getElements().color) getElements().color.value = hex;
    setTool('brush');
  }

  function canvasToBlob() {
    return new Promise((resolve, reject) => {
      master.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the sprite sheet.')), 'image/png');
    });
  }

  async function saveNow() {
    if (!state.key || !state.dirty) return state.savePromise;
    if (state.savePromise) {
      await state.savePromise;
      if (!state.dirty) return;
    }
    const characterKey = state.key;
    const revision = state.revision;
    setStatus('Saving…', 'saving');
    state.savePromise = (async () => {
      const blob = await canvasToBlob();
      await persistBlob(characterKey, blob);
      await installStoredSprite(characterKey, blob, true);
      if (state.key === characterKey && state.revision === revision) {
        state.dirty = false;
        setStatus('Saved locally', 'saved');
      }
    })();
    try {
      await state.savePromise;
    } catch (error) {
      setStatus(error?.message || 'Could not save sprite', 'error');
      throw error;
    } finally {
      state.savePromise = null;
    }
    if (state.dirty && state.key === characterKey) scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null;
      void saveNow().catch(error => console.warn('[CustomSprites] Autosave failed.', error));
    }, AUTOSAVE_DELAY_MS);
  }

  async function flush() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (state.savePromise) await state.savePromise;
    if (state.dirty) await saveNow();
  }

  async function replaceFromImage(image, markDirty = false) {
    validateDimensions(image.naturalWidth, image.naturalHeight);
    const before = markDirty ? captureSnapshot() : null;
    master.width = image.naturalWidth;
    master.height = image.naturalHeight;
    masterCtx.imageSmoothingEnabled = false;
    masterCtx.clearRect(0, 0, master.width, master.height);
    masterCtx.drawImage(image, 0, 0);
    if (!markDirty) {
      state.history.length = 0;
      state.future.length = 0;
      state.dirty = false;
      updateHistoryControls();
    } else {
      markChanged(before);
    }
    const idealZoom = Math.max(1, Math.min(6, Math.floor(760 / master.width)));
    state.zoom = idealZoom;
    if (getElements().zoom) getElements().zoom.value = String(idealZoom);
    repaint();
  }

  async function restoreTemplate() {
    try {
      await replaceFromImage(await loadTemplate(), true);
      setStatus('Template restored · saving…', 'dirty');
    } catch (error) {
      setStatus(error?.message || 'Could not load template', 'error');
    }
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return;
    const current = captureSnapshot();
    if (current) state.future.push(current);
    restoreSnapshot(previous);
    state.revision += 1;
    state.dirty = true;
    updateHistoryControls();
    setStatus('Undo · saving…', 'dirty');
    scheduleSave();
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    const current = captureSnapshot();
    if (current) state.history.push(current);
    restoreSnapshot(next);
    state.revision += 1;
    state.dirty = true;
    updateHistoryControls();
    setStatus('Redo · saving…', 'dirty');
    scheduleSave();
  }

  function downloadSprite() {
    master.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const name = Neo.getCustomCharacterSettings?.(state.key)?.name || 'custom-character';
      anchor.href = url;
      anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom-character'}-sprite.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }, 'image/png');
  }

  function startPreview() {
    clearInterval(state.previewTimer);
    state.previewFrame = 0;
    state.previewTimer = setInterval(() => {
      if (getElements().panel?.classList.contains('hidden')) return;
      state.previewFrame += 1;
      repaintPreview();
    }, 130);
  }

  function bindUi() {
    const els = getElements();
    if (!els.display || els.display.dataset.bound === 'true') return;
    els.display.dataset.bound = 'true';

    els.display.addEventListener('pointerdown', event => {
      if (!master.width || event.button !== 0) return;
      const point = pointerToPixel(event);
      if (state.tool === 'picker') {
        pickColor(point);
        repaint();
        return;
      }
      state.drawing = true;
      state.beforeStroke = captureSnapshot();
      state.lastPoint = point;
      paintPixel(point.x, point.y);
      repaint();
      els.display.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    els.display.addEventListener('pointermove', event => {
      if (!state.drawing) return;
      const point = pointerToPixel(event);
      paintLine(state.lastPoint || point, point);
      state.lastPoint = point;
      repaint();
    });
    const finishStroke = event => {
      if (!state.drawing) return;
      state.drawing = false;
      state.lastPoint = null;
      markChanged(state.beforeStroke);
      state.beforeStroke = null;
      els.display.releasePointerCapture?.(event.pointerId);
    };
    els.display.addEventListener('pointerup', finishStroke);
    els.display.addEventListener('pointercancel', finishStroke);

    els.brush?.addEventListener('click', () => setTool('brush'));
    els.eraser?.addEventListener('click', () => setTool('eraser'));
    els.picker?.addEventListener('click', () => setTool('picker'));
    els.color?.addEventListener('input', () => {
      state.brushColor = els.color.value;
      setTool('brush');
    });
    els.size?.addEventListener('change', () => { state.brushSize = Number(els.size.value) || 1; });
    els.zoom?.addEventListener('input', () => {
      state.zoom = Number(els.zoom.value) || 1;
      repaint();
    });
    els.undo?.addEventListener('click', undo);
    els.redo?.addEventListener('click', redo);
    els.restore?.addEventListener('click', () => void restoreTemplate());
    els.upload?.addEventListener('click', () => els.uploadInput?.click());
    els.uploadInput?.addEventListener('change', async () => {
      const file = els.uploadInput.files?.[0];
      els.uploadInput.value = '';
      if (!file) return;
      try {
        await replaceFromImage(await loadImage(file), true);
        setStatus('Imported · saving…', 'dirty');
      } catch (error) {
        setStatus(error?.message || 'Could not import sprite sheet', 'error');
      }
    });
    els.download?.addEventListener('click', downloadSprite);
    els.save?.addEventListener('click', () => void flush().catch(error => {
      setStatus(error?.message || 'Could not save sprite', 'error');
    }));
    window.addEventListener('keydown', event => {
      if (getElements().panel?.classList.contains('hidden') || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    });
    setTool('brush');
    updateHistoryControls();
  }

  async function open(characterKey) {
    if (!characterKey) return;
    bindUi();
    if (state.key === characterKey && master.width && master.height) {
      repaint();
      startPreview();
      return;
    }
    const token = ++state.openToken;
    if (state.key && state.key !== characterKey) {
      try { await flush(); } catch {}
    }
    state.key = characterKey;
    state.history.length = 0;
    state.future.length = 0;
    state.dirty = false;
    setStatus('Loading sprite…', 'saving');
    const source = Neo.CHARACTER_SPRITE_SHEETS?.[characterKey]?.image || await loadTemplate();
    if (token !== state.openToken) return;
    await replaceFromImage(source, false);
    setStatus(Neo.CHARACTER_SPRITE_SHEETS?.[characterKey] ? 'Saved locally' : 'Drawing over Thorn Knight template', 'saved');
    startPreview();
  }

  async function close() {
    clearInterval(state.previewTimer);
    state.previewTimer = null;
    await flush();
  }

  async function remove(characterKey) {
    if (!characterKey) return;
    let pendingSave = null;
    if (state.key === characterKey) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
      state.dirty = false;
      state.key = '';
      pendingSave = state.savePromise;
    }
    try { await pendingSave; } catch {}
    delete Neo.CHARACTER_SHEET_DEFS?.[characterKey];
    delete Neo.CHARACTER_SPRITE_SHEETS?.[characterKey];
    Neo.invalidateSpriteTextureCache?.(characterKey);
    if (typeof Neo.buildSpriteAtlas === 'function' && Neo.SPRITE_ATLAS) Neo.SPRITE_ATLAS = Neo.buildSpriteAtlas();
    await deletePersistedBlob(characterKey);
  }

  Neo.preloadCustomCharacterSprites = preloadCustomCharacterSprites;
  Neo.hasCustomCharacterSprite = characterKey => !!Neo.CHARACTER_SPRITE_SHEETS?.[characterKey];
  Neo.CustomSpriteEditor = {
    open,
    close,
    flush,
    remove,
    restoreTemplate,
    isDirty: () => state.dirty,
  };
})();
