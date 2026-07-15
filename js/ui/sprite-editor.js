// sprite-editor.js — standalone IIFE. Developer-mode tool: browse every sprite
// the game draws from and repaint it. Image-backed sprites (character charsets,
// environment prop PNGs) edit real pixels and export a PNG to drop back into
// assets/sprites/. Procedural sprites (combatant pixel-art, item/move icons)
// edit the palette/grid data in place — live in this session — and export the
// owning .js data file. When launched with `npm run editor`, changes can be
// written directly back to the checkout instead of downloaded manually.

(() => {
  // Keys the roster treats as playable characters (see getCharacterOrder in
  // controller.js) — kept in sync by hand since that list isn't exposed globally.
  const PLAYABLE_KEYS = ['princess', 'thorn_knight', 'metao', 'gelleh', 'mooggy', 'turtle_boy', 'sarge'];

  const ENVIRONMENT_ASSET_FILES = [
    { src: 'assets/sprites/env/chair_0.png' },
    { src: 'assets/sprites/env/chair_1.png' },
    { src: 'assets/sprites/env/chest_0.png' },
    { src: 'assets/sprites/env/chest_a_b.png' },
    { src: 'assets/sprites/env/ground_0.png' },
    { src: 'assets/sprites/env/pillar.png' },
    { src: 'assets/sprites/env/table_0.png' },
    { src: 'assets/sprites/env/table_1.png' },
  ];
  const UNUSED_ASSET_FILES = [];

  const ACTOR_GRID_SIZE = 10;
  const ICON_GRID_SIZE = 8;

  function prettyLabel(key) {
    return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function basename(path) {
    return String(path || '').split('/').pop();
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let els = null;
  function getEls() {
    if (els) return els;
    els = {
      panel: document.getElementById('spriteEditorPanel'),
      backdrop: document.getElementById('spriteEditorBackdrop'),
      closeBtn: document.getElementById('spriteEditorClose'),
      tabs: document.getElementById('spriteEditorTabs'),
      search: document.getElementById('spriteEditorSearch'),
      grid: document.getElementById('spriteEditorGrid'),
      detail: document.getElementById('spriteEditorDetail'),
      loadPaletteBtn: document.getElementById('spriteEditorLoadPalette'),
      paletteInput: document.getElementById('spriteEditorPaletteInput'),
      paletteStatus: document.getElementById('spriteEditorPaletteStatus'),
    };
    return els;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'characters', label: 'Characters' },
    { id: 'enemies', label: 'Enemies' },
    { id: 'icons', label: 'Icons' },
    { id: 'unused', label: 'Unused Assets' },
    { id: 'envTiles', label: 'Env Tiles' },
  ];

  const state = {
    open: false,
    catalog: null,
    activeTab: 'characters',
    query: '',
    selectedId: '',
    editor: null, // active editor-state for the selected entry
    customPalette: [], // loaded once per session, shared across every sprite kind
    directSave: false,
  };

  function clonePlain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function markDirty(editor, dirty = true) {
    if (!editor) return;
    editor.dirty = dirty;
    const status = document.getElementById('seDirtyStatus');
    if (status) status.textContent = dirty ? 'Unsaved changes' : 'Saved';
    const saveBtn = document.getElementById('seSaveDirect');
    if (saveBtn && saveBtn.dataset.historySave === 'true') saveBtn.disabled = !dirty;
  }

  function ensureHistory(editor) {
    if (!editor.undoStack) editor.undoStack = [];
    if (!editor.redoStack) editor.redoStack = [];
  }

  function snapshotsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.imageData || b.imageData) {
      if (!a.imageData || !b.imageData) return false;
      if (a.width !== b.width || a.height !== b.height) return false;
      const ad = a.imageData.data;
      const bd = b.imageData.data;
      if (ad.length !== bd.length) return false;
      for (let i = 0; i < ad.length; i += 1) if (ad[i] !== bd[i]) return false;
      return JSON.stringify(a.config || {}) === JSON.stringify(b.config || {});
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushHistory(editor, before, after) {
    if (!editor || !before || !after || snapshotsEqual(before, after)) return;
    ensureHistory(editor);
    editor.undoStack.push({ before, after });
    if (editor.undoStack.length > 80) editor.undoStack.shift();
    editor.redoStack = [];
    markDirty(editor, true);
    refreshHistoryControls(editor);
  }

  function refreshHistoryControls(editor = state.editor) {
    if (!editor) return;
    ensureHistory(editor);
    const undo = document.getElementById('seUndo');
    const redo = document.getElementById('seRedo');
    if (undo) undo.disabled = editor.undoStack.length === 0;
    if (redo) redo.disabled = editor.redoStack.length === 0;
    markDirty(editor, !!editor.dirty);
  }

  function historyBarHtml() {
    return `
      <div class="sprite-editor-historybar">
        <button type="button" class="sandbox-mini-btn" id="seUndo" title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" class="sandbox-mini-btn" id="seRedo" title="Redo (Ctrl+Y)">Redo</button>
        <span class="sprite-editor-note" id="seDirtyStatus">Saved</span>
      </div>
    `;
  }

  function directSaveButtonHtml(label = 'Save to Game') {
    if (state.directSave) {
      return `<button type="button" class="nav-btn" id="seSaveDirect" data-history-save="true" disabled>${label}</button>`;
    }
    return `<button type="button" class="nav-btn" id="seSaveDirect" disabled title="Run npm run editor to enable direct file writes">${label}</button>`;
  }

  function directSaveHintHtml() {
    return state.directSave ? '' : '<span class="sprite-editor-note sprite-editor-action-note">Run npm run editor to enable direct file saves.</span>';
  }

  function wireHistoryControls(editor, rerender) {
    ensureHistory(editor);
    const applyEntry = (snapshot, source, target) => {
      const entry = source.pop();
      if (!entry) return;
      target.push(entry);
      editor.applySnapshot(snapshot);
      markDirty(editor, true);
      refreshHistoryControls(editor);
      rerender?.();
    };
    document.getElementById('seUndo')?.addEventListener('click', () => applyEntry(editor.undoStack.at(-1)?.before, editor.undoStack, editor.redoStack));
    document.getElementById('seRedo')?.addEventListener('click', () => applyEntry(editor.redoStack.at(-1)?.after, editor.redoStack, editor.undoStack));
    refreshHistoryControls(editor);
  }

  let atlasRebuildTimer = null;
  function scheduleAtlasRebuild() {
    clearTimeout(atlasRebuildTimer);
    atlasRebuildTimer = setTimeout(() => {
      if (typeof Neo.buildSpriteAtlas === 'function') Neo.SPRITE_ATLAS = Neo.buildSpriteAtlas();
    }, 200);
  }

  // Single set of window-level drag listeners shared by every detail render —
  // each render just swaps `currentDrag`, so re-selecting sprites never piles
  // up extra window listeners bound to long-gone canvases.
  let currentDrag = null;
  function bindPaintDrag(canvas, onPaint, onStart, onEnd) {
    currentDrag = { painting: false, onPaint, onStart, onEnd };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture?.(e.pointerId);
      currentDrag.painting = true;
      currentDrag.dragMoved = false;
      currentDrag.before = onStart?.(e.clientX, e.clientY);
      onPaint(e.clientX, e.clientY);
    });
  }
  window.addEventListener('pointermove', e => {
    if (currentDrag?.painting) {
      currentDrag.dragMoved = true;
      currentDrag.onPaint(e.clientX, e.clientY);
    }
  });
  window.addEventListener('pointerup', () => {
    if (!currentDrag?.painting) return;
    currentDrag.painting = false;
    currentDrag.onEnd?.(currentDrag.before);
  });

  // Live animation preview (image-strip charsets only) — a single interval
  // shared the same way as currentDrag, so switching sprites never leaves an
  // old timer painting into a detached canvas.
  let previewTimer = null;
  function stopPreview() {
    if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  }
  function startImageStripPreview(canvas, editor) {
    stopPreview();
    const ctx = canvas.getContext('2d');
    previewTimer = setInterval(() => {
      const now = Date.now() / 1000;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / editor.frameWidth, canvas.height / editor.frameHeight);
      const dw = editor.frameWidth * scale;
      const dh = editor.frameHeight * scale;

      if (editor.previewMode === 'arm' && editor.armFrame != null) {
        // Spin it through a full rotation so you can see how it tracks aim
        // angle in-game, same transform the engine uses (drawAimIndicator).
        const angle = (now % 3) / 3 * Math.PI * 2;
        const baseAngle = Number(editor.armBaseAngle || 0);
        const pivot = editor.armPivot || {};
        const offset = editor.armOffset || {};
        const scaleX = dw / Math.max(1, editor.frameWidth);
        const scaleY = dh / Math.max(1, editor.frameHeight);
        const pivotX = Number.isFinite(Number(pivot.x)) ? Number(pivot.x) * scaleX : dw / 2;
        const pivotY = Number.isFinite(Number(pivot.y)) ? Number(pivot.y) * scaleY : dh / 2;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate((Number(offset.x) || 0) * scaleX, (Number(offset.y) || 0) * scaleY);
        ctx.rotate(angle - baseAngle);
        ctx.drawImage(
          editor.master,
          editor.armFrame * editor.frameWidth, 0, editor.frameWidth, editor.frameHeight,
          -pivotX, -pivotY, dw, dh,
        );
        ctx.restore();
        return;
      }

      let frameIndex;
      if (editor.previewMode === 'walk' && editor.walkFrames.length) {
        const stepRate = Number(editor.stepRate || 10);
        frameIndex = editor.walkFrames[Math.floor(now * stepRate) % editor.walkFrames.length];
      } else {
        const idleRate = Number(editor.idleRate || 1.15);
        const frames = editor.idleFrames.length ? editor.idleFrames : [0];
        frameIndex = frames[Math.floor(now * idleRate) % frames.length];
      }
      ctx.drawImage(
        editor.master,
        frameIndex * editor.frameWidth, 0, editor.frameWidth, editor.frameHeight,
        (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh,
      );
    }, 1000 / 24);
  }

  // ── Custom palette (load-your-own-colors) ────────────────────────────────
  function parsePaletteFile(text) {
    const trimmed = text.trim();
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) return json.filter(c => typeof c === 'string');
      if (Array.isArray(json?.colors)) return json.colors.filter(c => typeof c === 'string');
    } catch (err) { /* not JSON — fall through to plain-text parsing */ }
    const hexMatches = trimmed.match(/#[0-9a-fA-F]{3,8}/g);
    if (hexMatches?.length) return hexMatches;
    // GIMP .gpl-style "R G B  Name" lines.
    const colors = [];
    trimmed.split('\n').forEach(line => {
      const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
      if (!m) return;
      const [r, g, b] = [m[1], m[2], m[3]].map(n => Math.min(255, parseInt(n, 10)));
      colors.push(`#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`);
    });
    return colors;
  }

  function parseAsePaletteBuffer(buffer) {
    const view = new DataView(buffer);
    const colors = [];
    if (view.byteLength < 128 || view.getUint16(4, true) !== 0xa5e0) return colors;
    const frames = view.getUint16(6, true);
    let offset = 128;
    for (let frame = 0; frame < frames && offset + 16 <= view.byteLength; frame += 1) {
      const frameSize = view.getUint32(offset, true);
      if (frameSize <= 0 || offset + frameSize > view.byteLength) break;
      const frameEnd = offset + frameSize;
      if (view.getUint16(offset + 4, true) !== 0xf1fa) break;
      const oldChunkCount = view.getUint16(offset + 6, true);
      const newChunkCount = offset + 16 <= frameEnd ? view.getUint32(offset + 12, true) : 0;
      const chunkCount = newChunkCount || oldChunkCount;
      let chunkOffset = offset + 16;
      for (let chunk = 0; chunk < chunkCount && chunkOffset + 6 <= frameEnd; chunk += 1) {
        const chunkSize = view.getUint32(chunkOffset, true);
        const chunkType = view.getUint16(chunkOffset + 4, true);
        const chunkEnd = chunkOffset + chunkSize;
        if (chunkSize < 6 || chunkEnd > frameEnd) break;
        if (chunkType === 0x2019 && chunkOffset + 22 <= chunkEnd) {
          const paletteSize = view.getUint32(chunkOffset + 6, true);
          const firstIndex = view.getUint32(chunkOffset + 10, true);
          const lastIndex = view.getUint32(chunkOffset + 14, true);
          let entryOffset = chunkOffset + 26;
          const count = Math.min(paletteSize, lastIndex - firstIndex + 1);
          for (let i = 0; i < count && entryOffset + 6 <= chunkEnd; i += 1) {
            const flags = view.getUint16(entryOffset, true);
            const r = view.getUint8(entryOffset + 2);
            const g = view.getUint8(entryOffset + 3);
            const b = view.getUint8(entryOffset + 4);
            const a = view.getUint8(entryOffset + 5);
            entryOffset += 6;
            if (flags & 1 && entryOffset + 2 <= chunkEnd) {
              const nameBytes = view.getUint16(entryOffset, true);
              entryOffset += 2 + nameBytes;
            }
            if (a === 0) continue;
            colors.push(`#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`);
          }
        }
        chunkOffset = chunkEnd;
      }
      offset = frameEnd;
    }
    return [...new Set(colors)];
  }

  async function loadDefaultPalette() {
    if (state.customPalette.length) return;
    const { paletteStatus } = getEls();
    try {
      const res = await fetch('assets/sprites/my-pal.ase', { cache: 'no-store' });
      if (!res.ok) return;
      const colors = parseAsePaletteBuffer(await res.arrayBuffer());
      if (!colors.length) return;
      state.customPalette = colors;
      if (paletteStatus) paletteStatus.textContent = `${colors.length} colors from my-pal.ase`;
      renderPaletteStrip();
    } catch (_error) {
      // Optional local palette; ignore when absent or served without binary access.
    }
  }

  function renderPaletteStrip() {
    const paletteStrip = document.getElementById('spriteEditorPaletteStrip');
    if (!paletteStrip) return;
    paletteStrip.innerHTML = '';
    state.customPalette.forEach(hex => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sprite-editor-palette-swatch';
      btn.style.background = hex;
      btn.title = hex;
      btn.addEventListener('click', () => state.editor?.applyPaletteColor?.(hex));
      paletteStrip.appendChild(btn);
    });
  }

  function wirePaletteLoader() {
    const { loadPaletteBtn, paletteInput, paletteStatus } = getEls();
    loadPaletteBtn?.addEventListener('click', () => paletteInput.click());
    paletteInput?.addEventListener('change', async () => {
      const file = paletteInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const colors = parsePaletteFile(text);
      if (!colors.length) {
        if (paletteStatus) paletteStatus.textContent = 'No colors found in that file.';
        return;
      }
      state.customPalette = colors;
      if (paletteStatus) paletteStatus.textContent = `${colors.length} colors loaded`;
      renderPaletteStrip();
    });
  }

  function paletteStripHtml() {
    return '<div class="sprite-editor-palette-strip" id="spriteEditorPaletteStrip"></div>';
  }

  function normalizeHexColor(hex) {
    const value = String(hex || '').trim().toLowerCase();
    const short = value.match(/^#([0-9a-f]{3})$/i);
    if (short) return `#${short[1].split('').map(ch => ch + ch).join('')}`;
    const full = value.match(/^#[0-9a-f]{6}$/i);
    return full ? value : '';
  }

  function currentBrushColor(editor, fallback = '#ffffff') {
    return normalizeHexColor(editor?.brushColor) || normalizeHexColor(fallback) || '#ffffff';
  }

  function brushColorControlHtml(editor, fallback = '#ffffff') {
    return `
      <label class="sprite-editor-color-control">
        <span>Color</span>
        <input type="color" id="seBrushColor" value="${currentBrushColor(editor, fallback)}">
      </label>
    `;
  }

  function wireBrushColorControl(container, editor) {
    const input = container.querySelector('#seBrushColor');
    if (!input) return;
    editor.brushColor = input.value;
    input.addEventListener('input', e => {
      editor.brushColor = normalizeHexColor(e.target.value) || e.target.value;
      editor.erasing = false;
      const eraser = container.querySelector('#seEraser');
      if (eraser) eraser.checked = false;
    });
  }

  function findOrCreatePaletteKey(palette, hex, preferredKey = '') {
    const color = normalizeHexColor(hex);
    if (!palette || !color) return preferredKey || Object.keys(palette || {})[0] || 'a';
    const existing = Object.keys(palette).find(key => normalizeHexColor(palette[key]) === color);
    if (existing) return existing;
    const preferred = String(preferredKey || '').toLowerCase();
    if (preferred && !palette[preferred]) {
      palette[preferred] = color;
      return preferred;
    }
    const next = 'abcdefghijklmnopqrstuvwxyz'.split('').find(key => !palette[key]);
    const key = next || Object.keys(palette).at(-1) || 'a';
    palette[key] = color;
    return key;
  }

  // ── Catalog ───────────────────────────────────────────────────────────────
  function buildCatalog() {
    const sheetDefs = Neo.CHARACTER_SHEET_DEFS || {};
    const spriteDefs = Neo.SPRITE_DEFS || window.NeoNykeSpriteDefs || {};
    const iconDefs = window.NeoNykeIconDefs || {};
    const environmentDefs = window.NeoNykeEnvironmentTileDefs || {};
    const tileDefs = environmentDefs.tiles || {};
    const propSpriteDefs = environmentDefs.propSprites || {};

    const characters = [];
    const enemies = [];

    Object.keys(spriteDefs).forEach(key => {
      const def = spriteDefs[key];
      if (!def?.pixels || !def?.palette) return;
      const isPlayable = PLAYABLE_KEYS.includes(key);
      const hasCharset = !!sheetDefs[key];
      const entry = {
        id: `${isPlayable ? 'char' : 'enemy'}:${key}`,
        tab: isPlayable ? 'characters' : 'enemies',
        kind: (isPlayable && hasCharset) ? 'image-strip' : 'pixel-grid',
        key,
        label: prettyLabel(key),
      };
      if (entry.kind === 'image-strip') {
        const sheetDef = sheetDefs[key];
        entry.src = sheetDef.src;
        entry.frameWidth = sheetDef.frameWidth;
        entry.frameHeight = sheetDef.frameHeight;
        entry.frameCount = sheetDef.frameCount;
        entry.savePath = sheetDef.src;
        entry.liveCharsetKey = key;
      }
      (isPlayable ? characters : enemies).push(entry);
    });

    const icons = [];
    Object.keys(iconDefs).forEach(group => {
      const entries = iconDefs[group] || {};
      Object.keys(entries).forEach(key => {
        const def = entries[key];
        if (!def?.pixels) return;
        icons.push({
          id: `icon:${group}:${key}`,
          tab: 'icons',
          kind: 'icon-grid',
          group,
          key,
          label: prettyLabel(key),
        });
      });
    });

    const unused = UNUSED_ASSET_FILES.map(file => ({
      id: `unused:${file.src}`,
      tab: 'unused',
      kind: 'image-strip',
      src: file.src,
      savePath: file.src,
      label: prettyLabel(basename(file.src).replace(/\.png$/i, '')),
      autoDetectFrames: true,
    }));

    const envTiles = Object.keys(tileDefs).map(key => ({
      id: `envtile:${key}`,
      tab: 'envTiles',
      kind: 'env-tile',
      key,
      label: prettyLabel(key),
      def: tileDefs[key],
    })).concat(Object.keys(propSpriteDefs).map(key => ({
      id: `envprop:${key}`,
      tab: 'envTiles',
      kind: 'env-tile',
      key,
      label: prettyLabel(key),
      def: propSpriteDefs[key],
      propSprite: true,
    }))).concat(ENVIRONMENT_ASSET_FILES.map(file => ({
      id: `envimage:${file.src}`,
      tab: 'envTiles',
      kind: 'image-strip',
      src: file.src,
      savePath: file.src,
      label: prettyLabel(basename(file.src).replace(/\.png$/i, '')),
      autoDetectFrames: true,
    })));

    return { characters, enemies, icons, unused, envTiles };
  }

  function entriesForTab(tabId) {
    const catalog = state.catalog || (state.catalog = buildCatalog());
    return catalog[tabId] || [];
  }

  function findEntry(id) {
    const catalog = state.catalog || (state.catalog = buildCatalog());
    for (const tabId of Object.keys(catalog)) {
      const found = catalog[tabId].find(e => e.id === id);
      if (found) return found;
    }
    return null;
  }

  // Re-derives the catalog after a live structural change (converting a
  // character between procedural art and a loaded PNG file) and re-selects
  // the same entry so the detail pane picks up its new kind.
  function refreshCatalogAndReselect(id) {
    state.catalog = buildCatalog();
    state.selectedId = id;
    state.editor = null;
    renderGrid();
    renderDetail();
  }

  // ── Thumbnail rendering ───────────────────────────────────────────────────
  const imageCache = new Map(); // src -> HTMLImageElement (loaded)

  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, promise);
    return promise;
  }

  function drawPixelGridThumb(canvas, def) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cell = canvas.width / ACTOR_GRID_SIZE;
    def.pixels.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const p = row[x];
        if (p === '.') continue;
        ctx.fillStyle = def.palette[p] || '#ff00ff';
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    });
  }

  function drawIconThumb(canvas, def) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cell = canvas.width / ICON_GRID_SIZE;
    ctx.fillStyle = def.color || '#ffffff';
    (def.pixels || []).forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell)));
    if (def.accent && def.accentPixels) {
      ctx.fillStyle = def.accent;
      def.accentPixels.forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell)));
    }
  }

  function drawImageIntoThumb(canvas, img) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!img) return;
    const frameW = Math.min(img.naturalWidth, img.naturalHeight) || img.naturalWidth;
    ctx.drawImage(img, 0, 0, frameW, img.naturalHeight, 0, 0, canvas.width, canvas.height);
  }

  async function drawImageThumb(canvas, entry) {
    // Prefer whatever image is already live in memory (painted/replaced this
    // session) over re-fetching the original file, so the list reflects edits.
    const liveImg = entry.liveCharsetKey ? Neo.CHARACTER_SPRITE_SHEETS?.[entry.liveCharsetKey]?.image : null;
    if (liveImg) { drawImageIntoThumb(canvas, liveImg); return; }
    const img = await loadImage(entry.src);
    drawImageIntoThumb(canvas, img);
  }

  function renderThumb(entry) {
    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'sprite-editor-thumb';
    wrap.dataset.id = entry.id;
    const canvas = document.createElement('canvas');
    canvas.width = 56;
    canvas.height = 56;
    canvas.className = 'sprite-editor-thumb__canvas';
    const label = document.createElement('span');
    label.className = 'sprite-editor-thumb__label';
    label.textContent = entry.kind === 'icon-grid' ? `${entry.group} · ${entry.label}` : entry.label;
    wrap.append(canvas, label);

    if (entry.kind === 'pixel-grid') {
      drawPixelGridThumb(canvas, Neo.SPRITE_DEFS[entry.key]);
    } else if (entry.kind === 'icon-grid') {
      drawIconThumb(canvas, window.NeoNykeIconDefs[entry.group][entry.key]);
    } else if (entry.kind === 'image-strip') {
      drawImageThumb(canvas, entry);
    } else if (entry.kind === 'env-tile') {
      const ctx = canvas.getContext('2d');
      const tile = document.createElement('canvas');
      tile.width = 16;
      tile.height = 16;
      if (entry.propSprite) Neo.drawEnvironmentPixelSprite?.(tile.getContext('2d'), 0, 0, 16, 16, entry.def);
      else Neo.drawEnvironmentTileAsset?.(tile.getContext('2d'), 0, 0, 16, entry.def);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tile, 0, 0, canvas.width, canvas.height);
    }

    wrap.addEventListener('click', () => selectEntry(entry.id));
    return wrap;
  }

  function renderGrid() {
    const { grid } = getEls();
    grid.innerHTML = '';
    const query = state.query.trim().toLowerCase();
    const entries = entriesForTab(state.activeTab).filter(entry => {
      if (!query) return true;
      return entry.label.toLowerCase().includes(query) || (entry.key || '').toLowerCase().includes(query);
    });
    entries.forEach(entry => {
      const thumb = renderThumb(entry);
      if (entry.id === state.selectedId) thumb.classList.add('active');
      grid.appendChild(thumb);
    });
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'sprite-editor-empty';
      empty.textContent = 'No sprites match your search.';
      grid.appendChild(empty);
    }
  }

  function renderTabs() {
    const { tabs } = getEls();
    tabs.innerHTML = '';
    TABS.forEach(tab => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sprite-editor-tab${tab.id === state.activeTab ? ' active' : ''}`;
      btn.textContent = tab.label;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => {
        if (state.activeTab === tab.id) return;
        state.activeTab = tab.id;
        state.selectedId = '';
        state.editor = null;
        state.query = '';
        const { search } = getEls();
        if (search) search.value = '';
        renderTabs();
        renderGrid();
        renderDetail();
      });
      tabs.appendChild(btn);
    });
  }

  function selectEntry(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    state.editor = null;
    renderGrid();
    renderDetail();
  }

  async function detectDirectSave() {
    try {
      const response = await fetch('/api/editor/status', { cache: 'no-store' });
      state.directSave = response.ok && (await response.json()).ok === true;
    } catch (_error) {
      state.directSave = false;
    }
  }

  async function saveEditorFile(path, content, encoding = 'utf8') {
    const response = await fetch('/api/editor/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content, encoding }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
    return result;
  }

  async function canvasPngBase64(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode PNG');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  async function saveImageStrip(editor, button) {
    button.disabled = true;
    try {
      await saveEditorFile(editor.entry.savePath, await canvasPngBase64(editor.master), 'base64');
      button.textContent = 'Saved';
      imageCache.delete(editor.entry.src);
      markDirty(editor, false);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = 'Save to Game';
        if (button.dataset.historySave === 'true') button.disabled = !editor?.dirty;
      }, 1200);
    }
  }

  async function saveCharacterToGame(editor, button) {
    button.disabled = true;
    try {
      // Frame roles are committed before serializing so armFrame, animation
      // membership, dimensions, and speeds always match the PNG being saved.
      commitFrameConfigLive(editor);
      const png = await canvasPngBase64(editor.master);
      const config = await buildDataFile('characterSheets');
      await saveEditorFile(editor.entry.savePath, png, 'base64');
      await saveEditorFile(config.info.path, config.text);
      imageCache.delete(editor.entry.src);
      button.textContent = 'Sprite + Config Saved';
      markDirty(editor, false);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = 'Save Sprite + Config';
        if (button.dataset.historySave === 'true') button.disabled = !editor?.dirty;
      }, 1400);
    }
  }

  // ── Live charset <-> procedural conversion ("is this a loaded file?") ────
  function convertToImageStrip(key, file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const frameHeight = img.naturalHeight;
      const frameCount = Math.max(1, Math.round(img.naturalWidth / frameHeight));
      const def = {
        src: `assets/sprites/chars/${prettyLabel(key).replace(/\s+/g, '')}.png`,
        frameWidth: frameHeight,
        frameHeight,
        frameCount,
        renderScale: 1.5,
      };
      const roles = Neo.resolveCharacterFrameRoles
        ? Neo.resolveCharacterFrameRoles(def, frameCount)
        : { idleFrames: [0], walkFrames: Array.from({ length: frameCount }, (_, i) => i).filter(i => i !== 0), armFrame: null, portraitFrame: 0 };
      Neo.CHARACTER_SHEET_DEFS = Neo.CHARACTER_SHEET_DEFS || {};
      Neo.CHARACTER_SHEET_DEFS[key] = def;
      Neo.CHARACTER_SPRITE_SHEETS = Neo.CHARACTER_SPRITE_SHEETS || {};
      Neo.CHARACTER_SPRITE_SHEETS[key] = {
        ...def,
        image: img,
        frameCount,
        idleFrames: roles.idleFrames,
        walkFrames: roles.walkFrames,
        armFrame: roles.armFrame,
        portraitFrame: roles.portraitFrame,
        animations: {
          idle: roles.idleFrames.map((_, i) => `idle${i}`),
          walk: roles.walkFrames.map((_, i) => `walk${i}`),
        },
      };
      URL.revokeObjectURL(url);
      scheduleAtlasRebuild();
      refreshCatalogAndReselect(`char:${key}`);
    };
    img.src = url;
  }

  function convertToProcedural(key) {
    if (Neo.CHARACTER_SHEET_DEFS) delete Neo.CHARACTER_SHEET_DEFS[key];
    if (Neo.CHARACTER_SPRITE_SHEETS) delete Neo.CHARACTER_SPRITE_SHEETS[key];
    scheduleAtlasRebuild();
    refreshCatalogAndReselect(`char:${key}`);
  }

  // ── Detail: image-strip editor (charsets + unused-asset PNGs) ────────────
  async function buildImageStripEditor(entry) {
    const liveSheet = entry.liveCharsetKey ? Neo.CHARACTER_SPRITE_SHEETS?.[entry.liveCharsetKey] : null;
    // Prefer the in-memory (possibly already-edited) image over re-fetching
    // the original file, so reopening a sprite you already painted this
    // session doesn't discard your edits.
    const img = liveSheet?.image || await loadImage(`${entry.src}?_edit=${Date.now()}`);
    const editor = {
      kind: 'image-strip',
      entry,
      master: document.createElement('canvas'),
      frameWidth: entry.frameWidth || (img ? Math.min(img.naturalWidth, img.naturalHeight) : 24),
      frameHeight: entry.frameHeight || (img ? img.naturalHeight : 24),
      frameCount: entry.frameCount || 1,
      currentFrame: 0,
      brushColor: '#ffffff',
      erasing: false,
      scale: 10,
      idleFrames: liveSheet?.idleFrames ? [...liveSheet.idleFrames] : null,
      walkFrames: liveSheet?.walkFrames ? [...liveSheet.walkFrames] : null,
      armFrame: Number.isInteger(liveSheet?.armFrame) ? liveSheet.armFrame : null,
      armBaseAngle: liveSheet?.armBaseAngle ?? entry.armBaseAngle ?? 0,
      armPivot: liveSheet?.armPivot ? { ...liveSheet.armPivot } : (entry.armPivot ? { ...entry.armPivot } : null),
      armOffset: liveSheet?.armOffset ? { ...liveSheet.armOffset } : (entry.armOffset ? { ...entry.armOffset } : null),
      portraitFrame: Number.isInteger(liveSheet?.portraitFrame) ? liveSheet.portraitFrame : null,
      stepRate: liveSheet?.stepRate ?? '',
      idleRate: liveSheet?.idleRate ?? '',
    };
    if (img) {
      editor.master.width = img.naturalWidth;
      editor.master.height = img.naturalHeight;
      const ctx = editor.master.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      if (entry.autoDetectFrames) {
        editor.frameWidth = editor.frameHeight;
        editor.frameCount = Math.max(1, Math.round(img.naturalWidth / editor.frameHeight));
      }
    } else {
      editor.master.width = editor.frameWidth;
      editor.master.height = editor.frameHeight;
    }
    if (entry.liveCharsetKey) {
      if (!editor.idleFrames) editor.idleFrames = [0];
      if (!editor.walkFrames) {
        editor.walkFrames = Array.from({ length: editor.frameCount }, (_, i) => i).filter(i => !editor.idleFrames.includes(i));
      }
      if (!Number.isInteger(editor.portraitFrame) || editor.portraitFrame >= editor.frameCount) {
        editor.portraitFrame = editor.idleFrames[0];
      }
    }
    editor.scale = Math.max(4, Math.min(16, Math.round(240 / editor.frameWidth)));
    return editor;
  }

  function repaintImageStripCanvas(canvas, editor) {
    const ctx = canvas.getContext('2d');
    canvas.width = editor.frameWidth * editor.scale;
    canvas.height = editor.frameHeight * editor.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      editor.master,
      editor.currentFrame * editor.frameWidth, 0, editor.frameWidth, editor.frameHeight,
      0, 0, canvas.width, canvas.height,
    );
  }

  function renderFrameStrip(container, editor, onPick) {
    container.innerHTML = '';
    if (editor.frameCount <= 1) return;
    for (let i = 0; i < editor.frameCount; i += 1) {
      const item = document.createElement('div');
      item.className = 'sprite-editor-frame-item';
      const thumb = document.createElement('canvas');
      thumb.width = 32;
      thumb.height = 32;
      if (i === editor.currentFrame) thumb.classList.add('active');
      const ctx = thumb.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(editor.master, i * editor.frameWidth, 0, editor.frameWidth, editor.frameHeight, 0, 0, 32, 32);
      thumb.addEventListener('click', () => { editor.currentFrame = i; onPick(); });
      item.appendChild(thumb);
      if (editor.entry.liveCharsetKey) {
        const badge = document.createElement('span');
        badge.className = 'sprite-editor-role-badge';
        const idlePos = editor.idleFrames.indexOf(i);
        const walkPos = editor.walkFrames.indexOf(i);
        const parts = [];
        if (idlePos !== -1) parts.push(editor.idleFrames.length > 1 ? `I${idlePos + 1}` : 'IDLE');
        if (walkPos !== -1) parts.push(`W${walkPos + 1}`);
        if (editor.armFrame === i) parts.push('ARM');
        if (editor.portraitFrame === i) parts.push('PORT');
        badge.textContent = parts.join(' ');
        item.appendChild(badge);
      }
      container.appendChild(item);
    }
  }

  function commitCharsetLive(editor) {
    const key = editor.entry.liveCharsetKey;
    if (!key) return;
    const sheet = Neo.CHARACTER_SPRITE_SHEETS?.[key];
    if (!sheet) return;
    const img = new Image();
    img.onload = () => { sheet.image = img; scheduleAtlasRebuild(); };
    img.src = editor.master.toDataURL('image/png');
  }

  // Pushes frame size / idle-walk role / speed config from the editor into
  // the live sheet + def so the change takes effect immediately in-game.
  function commitFrameConfigLive(editor) {
    const key = editor.entry.liveCharsetKey;
    if (!key) return;
    const def = Neo.CHARACTER_SHEET_DEFS?.[key];
    if (!def) return;
    def.frameWidth = editor.frameWidth;
    def.frameHeight = editor.frameHeight;
    def.frameCount = editor.frameCount;
    def.idleFrames = [...editor.idleFrames];
    def.walkFrames = [...editor.walkFrames];
    if (editor.armFrame != null) def.armFrame = editor.armFrame; else delete def.armFrame;
    def.armBaseAngle = Number(editor.armBaseAngle || 0);
    if (editor.armPivot) def.armPivot = { ...editor.armPivot }; else delete def.armPivot;
    if (editor.armOffset) def.armOffset = { ...editor.armOffset }; else delete def.armOffset;
    if (editor.portraitFrame != null && editor.portraitFrame !== editor.idleFrames[0]) def.portraitFrame = editor.portraitFrame;
    else delete def.portraitFrame;
    if (editor.stepRate !== '' && editor.stepRate != null) def.stepRate = Number(editor.stepRate);
    else delete def.stepRate;
    if (editor.idleRate !== '' && editor.idleRate != null) def.idleRate = Number(editor.idleRate);
    else delete def.idleRate;

    const sheet = Neo.CHARACTER_SPRITE_SHEETS?.[key];
    if (sheet) {
      sheet.frameWidth = editor.frameWidth;
      sheet.frameHeight = editor.frameHeight;
      sheet.frameCount = editor.frameCount;
      sheet.idleFrames = [...editor.idleFrames];
      sheet.walkFrames = [...editor.walkFrames];
      sheet.armFrame = editor.armFrame != null ? editor.armFrame : null;
      sheet.armBaseAngle = Number(editor.armBaseAngle || 0);
      sheet.armPivot = editor.armPivot ? { ...editor.armPivot } : undefined;
      sheet.armOffset = editor.armOffset ? { ...editor.armOffset } : undefined;
      sheet.portraitFrame = editor.portraitFrame != null ? editor.portraitFrame : editor.idleFrames[0];
      sheet.animations = {
        idle: sheet.idleFrames.map((_, i) => `idle${i}`),
        walk: sheet.walkFrames.map((_, i) => `walk${i}`),
      };
      if (def.stepRate != null) sheet.stepRate = def.stepRate; else delete sheet.stepRate;
      if (def.idleRate != null) sheet.idleRate = def.idleRate; else delete sheet.idleRate;
    }
    scheduleAtlasRebuild();
  }

  function captureImageStripSnapshot(editor) {
    const ctx = editor.master.getContext('2d');
    return {
      width: editor.master.width,
      height: editor.master.height,
      imageData: ctx.getImageData(0, 0, editor.master.width, editor.master.height),
      config: {
        frameWidth: editor.frameWidth,
        frameHeight: editor.frameHeight,
        frameCount: editor.frameCount,
        currentFrame: editor.currentFrame,
        idleFrames: editor.idleFrames ? [...editor.idleFrames] : null,
        walkFrames: editor.walkFrames ? [...editor.walkFrames] : null,
        armFrame: editor.armFrame,
        armBaseAngle: Number(editor.armBaseAngle || 0),
        armPivot: editor.armPivot ? { ...editor.armPivot } : null,
        armOffset: editor.armOffset ? { ...editor.armOffset } : null,
        portraitFrame: editor.portraitFrame,
        stepRate: editor.stepRate,
        idleRate: editor.idleRate,
      },
    };
  }

  function applyImageStripSnapshot(editor, snapshot) {
    if (!snapshot) return;
    editor.master.width = snapshot.width;
    editor.master.height = snapshot.height;
    editor.master.getContext('2d').putImageData(snapshot.imageData, 0, 0);
    Object.assign(editor, clonePlain(snapshot.config));
    commitCharsetLive(editor);
    commitFrameConfigLive(editor);
  }

  async function downloadImageStrip(editor) {
    const blob = await new Promise(resolve => editor.master.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = basename(editor.entry.savePath);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderImageStripDetail(container, entry) {
    container.innerHTML = `
      <div class="sprite-editor-detail-head">
        <h4 class="sprite-editor-detail-title">${entry.label}</h4>
        <div class="sprite-editor-detail-path">save as: ${entry.savePath}</div>
      </div>
      <p class="sprite-editor-note">Loading…</p>
    `;
    if (!state.editor || state.editor.entry.id !== entry.id) {
      buildImageStripEditor(entry).then(editor => {
        if (state.selectedId !== entry.id) return; // selection changed while loading
        state.editor = editor;
        renderImageStripDetail(container, entry);
      });
      return;
    }

    const editor = state.editor;
    const isCharset = !!entry.liveCharsetKey;
    editor.captureSnapshot = () => captureImageStripSnapshot(editor);
    editor.applySnapshot = snapshot => applyImageStripSnapshot(editor, snapshot);
    container.innerHTML = `
      <div class="sprite-editor-detail-head">
        <h4 class="sprite-editor-detail-title">${entry.label}</h4>
        <div class="sprite-editor-detail-path">save as: ${entry.savePath}</div>
      </div>
      <p class="sprite-editor-note">${isCharset ? 'Edits preview live in this session (the atlas rebuilds automatically). ' : ''}Download saves a PNG — drop it into the path above to make the change permanent.</p>
      ${historyBarHtml()}
      <div class="sprite-editor-canvas-wrap"><canvas class="sprite-editor-canvas"></canvas></div>
      <div class="sprite-editor-toolbar">
        ${brushColorControlHtml(editor)}
        <label><input type="checkbox" id="seEraser"> Eraser</label>
      </div>
      ${paletteStripHtml()}
      <div class="sprite-editor-frame-strip" id="seFrameStrip"></div>
      <div class="sprite-editor-field-row">
        <label>Frame Width <input type="number" id="seFrameWidth" min="1" value="${editor.frameWidth}"></label>
        <label>Frame Height <input type="number" id="seFrameHeight" min="1" value="${editor.frameHeight}"></label>
        <span class="sprite-editor-note">canvas: ${editor.master.width}×${editor.master.height}px, ${editor.frameCount} frame${editor.frameCount === 1 ? '' : 's'}</span>
      </div>
      ${isCharset ? `
      <p class="sprite-editor-note">Pick a frame above, then mark its role — a frame can be in the idle cycle, the walk cycle, both, or neither. At least one frame must stay in the idle cycle.</p>
      <div class="sprite-editor-field-row">
        <label><input type="checkbox" id="seInIdle" ${editor.idleFrames.includes(editor.currentFrame) ? 'checked' : ''} ${editor.armFrame === editor.currentFrame ? 'disabled' : ''}> In idle cycle</label>
        <label><input type="checkbox" id="seInWalk" ${editor.walkFrames.includes(editor.currentFrame) ? 'checked' : ''} ${editor.armFrame === editor.currentFrame ? 'disabled' : ''}> In walk cycle</label>
        <label><input type="checkbox" id="seIsArm" ${editor.armFrame === editor.currentFrame ? 'checked' : ''}> Use as aim/arm sprite</label>
        <label><input type="checkbox" id="seIsPortrait" ${editor.portraitFrame === editor.currentFrame ? 'checked' : ''}> Use as chat/roster portrait</label>
      </div>
      <p class="sprite-editor-note">The aim/arm sprite replaces the plain aim-direction line in-game — it's drawn rotated to face wherever the character is aiming, so it should be a single reference pose (e.g. an arm pointing right at angle 0).</p>
      <p class="sprite-editor-note">The portrait frame is what chat dialogue and the character-select screen show for this character. Defaults to the first idle frame until you pick a different one here.</p>
      <div class="sprite-editor-preview-row">
        <div class="sprite-editor-canvas-wrap sprite-editor-preview-wrap"><canvas class="sprite-editor-preview-canvas" width="96" height="96"></canvas></div>
        <div>
          <div class="sprite-editor-field-row">
            <label><input type="radio" name="sePreviewMode" value="idle" ${editor.previewMode !== 'walk' && editor.previewMode !== 'arm' ? 'checked' : ''}> Preview Idle</label>
            <label><input type="radio" name="sePreviewMode" value="walk" ${editor.previewMode === 'walk' ? 'checked' : ''}> Preview Walk</label>
            <label><input type="radio" name="sePreviewMode" value="arm" ${editor.previewMode === 'arm' ? 'checked' : ''} ${editor.armFrame == null ? 'disabled' : ''}> Preview Arm (rotating)</label>
          </div>
          <div class="sprite-editor-field-row">
            <label>Walk Speed <input type="number" step="0.5" id="seStepRate" value="${editor.stepRate}" placeholder="10"></label>
            <label>Idle Speed <input type="number" step="0.1" id="seIdleRate" value="${editor.idleRate}" placeholder="1.15"></label>
          </div>
        </div>
      </div>
      ` : ''}
      <div class="sprite-editor-actions">
        <button type="button" class="sandbox-mini-btn" id="seReplace">Replace Image…</button>
        <input type="file" accept="image/png,image/*" id="seReplaceInput" style="display:none">
        <button type="button" class="nav-btn nav-btn--minor" id="seDownload">Download PNG</button>
        ${directSaveButtonHtml(isCharset ? 'Save Sprite + Config' : 'Save to Game')}
        ${directSaveHintHtml()}
        <button type="button" class="sandbox-mini-btn" id="seReset">Reset</button>
        ${isCharset ? `
          <button type="button" class="nav-btn nav-btn--minor" id="seDownloadSheetDefs">Download character-sheets.js</button>
          <button type="button" class="sandbox-mini-btn" id="seRevert">Revert to Procedural Art</button>
        ` : ''}
      </div>
    `;

    const canvas = container.querySelector('.sprite-editor-canvas');
    repaintImageStripCanvas(canvas, editor);
    const rerenderAll = () => renderImageStripDetail(container, entry);
    wireHistoryControls(editor, rerenderAll);
    renderPaletteStrip();
    renderFrameStrip(container.querySelector('#seFrameStrip'), editor, rerenderAll);

    let paintTimer = null;
    function paintAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor((clientX - rect.left) / editor.scale);
      const cy = Math.floor((clientY - rect.top) / editor.scale);
      if (cx < 0 || cy < 0 || cx >= editor.frameWidth || cy >= editor.frameHeight) return;
      const ctx = editor.master.getContext('2d');
      const fx = editor.currentFrame * editor.frameWidth + cx;
      if (editor.erasing) ctx.clearRect(fx, cy, 1, 1);
      else { ctx.fillStyle = editor.brushColor; ctx.fillRect(fx, cy, 1, 1); }
      repaintImageStripCanvas(canvas, editor);
      clearTimeout(paintTimer);
      paintTimer = setTimeout(() => commitCharsetLive(editor), 250);
    }
    bindPaintDrag(canvas, paintAt, () => editor.captureSnapshot(), before => {
      pushHistory(editor, before, editor.captureSnapshot());
    });

    editor.applyPaletteColor = hex => {
      editor.brushColor = normalizeHexColor(hex) || hex;
      const input = container.querySelector('#seBrushColor');
      if (input) input.value = currentBrushColor(editor);
    };

    wireBrushColorControl(container, editor);
    container.querySelector('#seEraser').addEventListener('change', e => { editor.erasing = e.target.checked; });

    function finalizeFrameSize() {
      editor.frameCount = Math.max(1, Math.floor(editor.master.width / editor.frameWidth));
      editor.currentFrame = Math.min(editor.currentFrame, editor.frameCount - 1);
      if (isCharset) {
        editor.idleFrames = editor.idleFrames.filter(i => i < editor.frameCount);
        if (!editor.idleFrames.length) editor.idleFrames = [0];
        editor.walkFrames = editor.walkFrames.filter(i => i < editor.frameCount);
        if (editor.armFrame != null && editor.armFrame >= editor.frameCount) editor.armFrame = null;
        if (!Number.isInteger(editor.portraitFrame) || editor.portraitFrame >= editor.frameCount) editor.portraitFrame = editor.idleFrames[0];
      }
      editor.scale = Math.max(4, Math.min(16, Math.round(240 / editor.frameWidth)));
      commitFrameConfigLive(editor);
      rerenderAll();
    }
    container.querySelector('#seFrameWidth').addEventListener('change', e => {
      const before = editor.captureSnapshot();
      editor.frameWidth = Math.max(1, parseInt(e.target.value, 10) || editor.frameWidth);
      finalizeFrameSize();
      pushHistory(editor, before, editor.captureSnapshot());
    });
    container.querySelector('#seFrameHeight').addEventListener('change', e => {
      const before = editor.captureSnapshot();
      editor.frameHeight = Math.max(1, parseInt(e.target.value, 10) || editor.frameHeight);
      finalizeFrameSize();
      pushHistory(editor, before, editor.captureSnapshot());
    });

    if (isCharset) {
      container.querySelector('#seInIdle').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        if (!e.target.checked && editor.idleFrames.length <= 1 && editor.idleFrames.includes(editor.currentFrame)) {
          e.target.checked = true; // at least one frame must stay in the idle cycle
          return;
        }
        if (e.target.checked) {
          if (!editor.idleFrames.includes(editor.currentFrame)) {
            editor.idleFrames = [...editor.idleFrames, editor.currentFrame].sort((a, b) => a - b);
          }
        } else {
          editor.idleFrames = editor.idleFrames.filter(i => i !== editor.currentFrame);
        }
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
        rerenderAll();
      });
      container.querySelector('#seInWalk').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        if (e.target.checked) {
          if (!editor.walkFrames.includes(editor.currentFrame)) {
            editor.walkFrames = [...editor.walkFrames, editor.currentFrame].sort((a, b) => a - b);
          }
        } else {
          editor.walkFrames = editor.walkFrames.filter(i => i !== editor.currentFrame);
        }
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
        rerenderAll();
      });
      container.querySelector('#seIsArm').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        editor.armFrame = e.target.checked ? editor.currentFrame : null;
        if (editor.armFrame != null) {
          editor.idleFrames = editor.idleFrames.filter(i => i !== editor.armFrame);
          editor.walkFrames = editor.walkFrames.filter(i => i !== editor.armFrame);
          if (!editor.idleFrames.length) {
            const fallback = Array.from({ length: editor.frameCount }, (_, i) => i).find(i => i !== editor.armFrame);
            if (fallback != null) editor.idleFrames = [fallback];
          }
        }
        if (editor.armFrame == null && editor.previewMode === 'arm') editor.previewMode = 'idle';
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
        rerenderAll();
      });
      container.querySelector('#seIsPortrait').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        editor.portraitFrame = e.target.checked ? editor.currentFrame : editor.idleFrames[0];
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
        rerenderAll();
      });
      container.querySelector('#seStepRate').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        editor.stepRate = e.target.value === '' ? '' : Number(e.target.value);
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
      });
      container.querySelector('#seIdleRate').addEventListener('change', e => {
        const before = editor.captureSnapshot();
        editor.idleRate = e.target.value === '' ? '' : Number(e.target.value);
        commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
      });
      container.querySelector('#seDownloadSheetDefs').addEventListener('click', () => downloadDataFile('characterSheets'));
      container.querySelector('#seRevert').addEventListener('click', () => convertToProcedural(entry.liveCharsetKey));

      const previewCanvas = container.querySelector('.sprite-editor-preview-canvas');
      editor.previewMode = editor.previewMode || 'idle';
      startImageStripPreview(previewCanvas, editor);
      container.querySelectorAll('input[name="sePreviewMode"]').forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) editor.previewMode = radio.value; });
      });
    }

    const replaceInput = container.querySelector('#seReplaceInput');
    container.querySelector('#seReplace').addEventListener('click', () => replaceInput.click());
    replaceInput.addEventListener('change', () => {
      const file = replaceInput.files?.[0];
      if (!file) return;
      const before = editor.captureSnapshot();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        editor.master.width = img.naturalWidth;
        editor.master.height = img.naturalHeight;
        const ctx = editor.master.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        if (entry.autoDetectFrames || isCharset) {
          editor.frameWidth = entry.frameWidth || img.naturalHeight;
          editor.frameHeight = entry.frameHeight || img.naturalHeight;
          editor.frameCount = Math.max(1, Math.round(img.naturalWidth / editor.frameWidth));
        }
        editor.currentFrame = 0;
        if (isCharset) {
          editor.idleFrames = editor.idleFrames.filter(i => i < editor.frameCount);
          if (!editor.idleFrames.length) editor.idleFrames = [0];
          editor.walkFrames = editor.walkFrames.filter(i => i < editor.frameCount);
          if (editor.armFrame != null && editor.armFrame >= editor.frameCount) editor.armFrame = null;
          if (!Number.isInteger(editor.portraitFrame) || editor.portraitFrame >= editor.frameCount) editor.portraitFrame = editor.idleFrames[0];
        }
        URL.revokeObjectURL(url);
        commitCharsetLive(editor);
        if (isCharset) commitFrameConfigLive(editor);
        pushHistory(editor, before, editor.captureSnapshot());
        renderImageStripDetail(container, entry);
      };
      img.src = url;
    });

    container.querySelector('#seDownload').addEventListener('click', () => downloadImageStrip(editor));
    container.querySelector('#seSaveDirect')?.addEventListener('click', e => {
      if (isCharset) saveCharacterToGame(editor, e.currentTarget);
      else saveImageStrip(editor, e.currentTarget);
    });
    container.querySelector('#seReset').addEventListener('click', () => {
      state.editor = null;
      renderImageStripDetail(container, entry);
    });
  }

  // ── Detail: procedural actor pixel-grid editor (combatants.js) ──────────
  function getActorDrawingBounds(def) {
    const rows = def?.pixels || [];
    let minX = ACTOR_GRID_SIZE;
    let minY = ACTOR_GRID_SIZE;
    let maxX = -1;
    let maxY = -1;
    rows.forEach((row, y) => {
      for (let x = 0; x < Math.min(row.length, ACTOR_GRID_SIZE); x += 1) {
        if (row[x] === '.') continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
    return maxX >= minX ? { x1: minX, y1: minY, x2: maxX, y2: maxY } : null;
  }

  function normalizeActorSelection(selection) {
    if (!selection) return null;
    const x1 = Math.max(0, Math.min(ACTOR_GRID_SIZE - 1, Math.min(selection.x1, selection.x2)));
    const y1 = Math.max(0, Math.min(ACTOR_GRID_SIZE - 1, Math.min(selection.y1, selection.y2)));
    const x2 = Math.max(0, Math.min(ACTOR_GRID_SIZE - 1, Math.max(selection.x1, selection.x2)));
    const y2 = Math.max(0, Math.min(ACTOR_GRID_SIZE - 1, Math.max(selection.y1, selection.y2)));
    return { x1, y1, x2, y2 };
  }

  function moveActorSelection(def, selection, dx, dy) {
    const selected = normalizeActorSelection(selection);
    if (!selected) return null;
    const clampedDx = Math.max(-selected.x1, Math.min(ACTOR_GRID_SIZE - 1 - selected.x2, Number(dx) || 0));
    const clampedDy = Math.max(-selected.y1, Math.min(ACTOR_GRID_SIZE - 1 - selected.y2, Number(dy) || 0));
    if (!clampedDx && !clampedDy) return null;
    const rows = Array.from({ length: ACTOR_GRID_SIZE }, (_, y) => {
      const row = String(def.pixels?.[y] || '').padEnd(ACTOR_GRID_SIZE, '.').slice(0, ACTOR_GRID_SIZE);
      return row.split('');
    });
    const cells = [];
    for (let y = selected.y1; y <= selected.y2; y += 1) {
      for (let x = selected.x1; x <= selected.x2; x += 1) {
        const value = rows[y][x];
        if (value === '.') continue;
        cells.push({ x, y, value });
        rows[y][x] = '.';
      }
    }
    if (!cells.length) return null;
    cells.forEach(cell => {
      rows[cell.y + clampedDy][cell.x + clampedDx] = cell.value;
    });
    def.pixels = rows.map(row => row.join(''));
    return {
      x1: selected.x1 + clampedDx,
      y1: selected.y1 + clampedDy,
      x2: selected.x2 + clampedDx,
      y2: selected.y2 + clampedDy,
    };
  }

  function renderActorDetail(container, entry) {
    const def = Neo.SPRITE_DEFS[entry.key];
    if (!state.editor || state.editor.entry.id !== entry.id) {
      state.editor = {
        kind: 'pixel-grid',
        entry,
        activeSwatch: 'a',
        erasing: false,
        scale: 36,
        selection: null,
      };
    }
    const editor = state.editor;
    const letters = Object.keys(def.palette);
    const fallbackBrush = def.palette[editor.activeSwatch] || def.palette[letters[0]] || '#ffffff';
    editor.brushColor = currentBrushColor(editor, fallbackBrush);
    const isCharacter = entry.tab === 'characters';
    editor.captureSnapshot = () => ({
      pixels: [...def.pixels],
      palette: { ...def.palette },
      activeSwatch: editor.activeSwatch,
      brushColor: editor.brushColor,
      erasing: editor.erasing,
      selection: editor.selection ? { ...editor.selection } : null,
    });
    editor.applySnapshot = snapshot => {
      if (!snapshot) return;
      def.pixels = [...snapshot.pixels];
      def.palette = { ...snapshot.palette };
      editor.activeSwatch = snapshot.activeSwatch || editor.activeSwatch;
      editor.brushColor = snapshot.brushColor || def.palette[editor.activeSwatch] || editor.brushColor;
      editor.erasing = !!snapshot.erasing;
      editor.selection = snapshot.selection ? { ...snapshot.selection } : null;
      scheduleAtlasRebuild();
    };

    container.innerHTML = `
      <div class="sprite-editor-detail-head">
        <h4 class="sprite-editor-detail-title">${entry.label}</h4>
        <div class="sprite-editor-detail-path">save to: assets/sprites/combatants.js</div>
      </div>
      <p class="sprite-editor-note">Edits apply live this session. This is the base pose the game procedurally derives idle/walk/attack frames from — you don't need to hand-draw each frame.</p>
      ${historyBarHtml()}
      <div class="sprite-editor-canvas-wrap sprite-editor-canvas-wrap--actor"><canvas class="sprite-editor-canvas"></canvas></div>
      <div class="sprite-editor-field-row sprite-editor-pixel-tools">
        <label>Cell size <input type="number" id="seActorScale" min="18" max="64" step="2" value="${editor.scale}"></label>
        <button type="button" class="sandbox-mini-btn" id="seSelectDrawing">Select Drawing</button>
        <button type="button" class="sandbox-mini-btn" id="seClearSelection" ${editor.selection ? '' : 'disabled'}>Clear Selection</button>
        <label>X <input type="number" id="seMoveX" min="-10" max="10" step="1" value="0"></label>
        <label>Y <input type="number" id="seMoveY" min="-10" max="10" step="1" value="0"></label>
        <button type="button" class="sandbox-mini-btn" id="seMoveSelection">Move</button>
      </div>
      <div class="sprite-editor-move-pad" aria-label="Move selected drawing">
        <button type="button" class="sandbox-mini-btn" data-move-x="0" data-move-y="-1" title="Move up">↑</button>
        <button type="button" class="sandbox-mini-btn" data-move-x="-1" data-move-y="0" title="Move left">←</button>
        <button type="button" class="sandbox-mini-btn" data-move-x="1" data-move-y="0" title="Move right">→</button>
        <button type="button" class="sandbox-mini-btn" data-move-x="0" data-move-y="1" title="Move down">↓</button>
      </div>
      ${paletteStripHtml()}
      <div class="sprite-editor-toolbar">
        ${brushColorControlHtml(editor, fallbackBrush)}
        <label><input type="checkbox" id="seEraser"> Eraser</label>
      </div>
      <div class="sprite-editor-actions">
        <button type="button" class="nav-btn nav-btn--minor" id="seDownload">Download combatants.js</button>
        ${directSaveButtonHtml()}
        ${directSaveHintHtml()}
        <button type="button" class="sandbox-mini-btn" id="seReset">Reset</button>
        ${isCharacter ? `
          <button type="button" class="sandbox-mini-btn" id="seLoadCharset">Load Custom Charset PNG…</button>
          <input type="file" accept="image/png,image/*" id="seLoadCharsetInput" style="display:none">
        ` : ''}
      </div>
    `;

    const canvas = container.querySelector('.sprite-editor-canvas');
    wireHistoryControls(editor, () => renderActorDetail(container, entry));
    renderPaletteStrip();
    wireBrushColorControl(container, editor);

    editor.applyPaletteColor = hex => {
      const color = normalizeHexColor(hex);
      if (!color) return;
      editor.brushColor = color;
      editor.erasing = false;
      const input = container.querySelector('#seBrushColor');
      if (input) input.value = color;
      const eraser = container.querySelector('#seEraser');
      if (eraser) eraser.checked = false;
    };

    canvas.width = ACTOR_GRID_SIZE * editor.scale;
    canvas.height = ACTOR_GRID_SIZE * editor.scale;
    repaintActorCanvas(canvas, def, editor);

    function commitActorMove(dx, dy) {
      const before = editor.captureSnapshot();
      const selection = editor.selection || getActorDrawingBounds(def);
      const movedSelection = moveActorSelection(def, selection, dx, dy);
      if (!movedSelection) return;
      editor.selection = movedSelection;
      repaintActorCanvas(canvas, def, editor);
      scheduleAtlasRebuild();
      pushHistory(editor, before, editor.captureSnapshot());
      const clearBtn = container.querySelector('#seClearSelection');
      if (clearBtn) clearBtn.disabled = false;
    }

    function paintAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor((clientX - rect.left) / editor.scale);
      const cy = Math.floor((clientY - rect.top) / editor.scale);
      if (cx < 0 || cy < 0 || cx >= ACTOR_GRID_SIZE || cy >= ACTOR_GRID_SIZE) return;
      if (!editor.erasing) {
        editor.activeSwatch = findOrCreatePaletteKey(def.palette, editor.brushColor, editor.activeSwatch);
      }
      const row = def.pixels[cy];
      const nextChar = editor.erasing ? '.' : editor.activeSwatch;
      if (row[cx] === nextChar) return;
      def.pixels[cy] = row.slice(0, cx) + nextChar + row.slice(cx + 1);
      repaintActorCanvas(canvas, def, editor);
      scheduleAtlasRebuild();
    }
    bindPaintDrag(canvas, paintAt, () => editor.captureSnapshot(), before => {
      pushHistory(editor, before, editor.captureSnapshot());
    });

    container.querySelector('#seActorScale').addEventListener('change', e => {
      editor.scale = Math.max(18, Math.min(64, Number(e.target.value) || 36));
      renderActorDetail(container, entry);
    });
    container.querySelector('#seSelectDrawing').addEventListener('click', () => {
      editor.selection = getActorDrawingBounds(def);
      repaintActorCanvas(canvas, def, editor);
      const clearBtn = container.querySelector('#seClearSelection');
      if (clearBtn) clearBtn.disabled = !editor.selection;
    });
    container.querySelector('#seClearSelection').addEventListener('click', e => {
      editor.selection = null;
      e.currentTarget.disabled = true;
      repaintActorCanvas(canvas, def, editor);
    });
    container.querySelector('#seMoveSelection').addEventListener('click', () => {
      const dx = Number(container.querySelector('#seMoveX')?.value || 0);
      const dy = Number(container.querySelector('#seMoveY')?.value || 0);
      commitActorMove(dx, dy);
    });
    container.querySelectorAll('[data-move-x][data-move-y]').forEach(btn => {
      btn.addEventListener('click', () => {
        commitActorMove(Number(btn.dataset.moveX), Number(btn.dataset.moveY));
      });
    });
    container.querySelector('#seEraser').addEventListener('change', e => { editor.erasing = e.target.checked; });
    container.querySelector('#seDownload').addEventListener('click', () => downloadDataFile('combatants'));
    container.querySelector('#seSaveDirect')?.addEventListener('click', e => saveDataFile('combatants', e.currentTarget, editor));
    container.querySelector('#seReset').addEventListener('click', () => {
      alert('Reset requires reloading the page — session edits to combatants.js are only held in memory, and the original defs aren\'t kept in a snapshot.');
    });

    if (isCharacter) {
      const loadInput = container.querySelector('#seLoadCharsetInput');
      container.querySelector('#seLoadCharset').addEventListener('click', () => loadInput.click());
      loadInput.addEventListener('change', () => {
        const file = loadInput.files?.[0];
        if (file) convertToImageStrip(entry.key, file);
      });
    }
  }

  function repaintActorCanvas(canvas, def, editor = state.editor) {
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / ACTOR_GRID_SIZE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    def.pixels.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const p = row[x];
        if (p === '.') continue;
        ctx.fillStyle = def.palette[p] || '#ff00ff';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    });
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 1; i < ACTOR_GRID_SIZE; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }
    const selection = normalizeActorSelection(editor?.selection);
    if (selection) {
      ctx.save();
      ctx.strokeStyle = '#ffd766';
      ctx.lineWidth = Math.max(2, Math.floor(cell * 0.08));
      ctx.setLineDash([Math.max(4, cell * 0.25), Math.max(3, cell * 0.18)]);
      ctx.strokeRect(
        selection.x1 * cell + ctx.lineWidth / 2,
        selection.y1 * cell + ctx.lineWidth / 2,
        (selection.x2 - selection.x1 + 1) * cell - ctx.lineWidth,
        (selection.y2 - selection.y1 + 1) * cell - ctx.lineWidth,
      );
      ctx.restore();
    }
  }

  // ── Detail: icon grid editor (icons.js) ──────────────────────────────────
  function renderIconDetail(container, entry) {
    const def = window.NeoNykeIconDefs[entry.group][entry.key];
    if (!state.editor || state.editor.entry.id !== entry.id) {
      state.editor = { kind: 'icon-grid', entry, scale: 30 };
    }
    const editor = state.editor;
    editor.brushColor = currentBrushColor(editor, def.color || '#ffffff');
    editor.captureSnapshot = () => ({
      color: def.color,
      accent: def.accent,
      pixels: clonePlain(def.pixels || []),
      accentPixels: clonePlain(def.accentPixels || []),
      brushColor: editor.brushColor,
      erasing: editor.erasing,
    });
    editor.applySnapshot = snapshot => {
      if (!snapshot) return;
      def.color = snapshot.color;
      if (snapshot.accent) def.accent = snapshot.accent; else delete def.accent;
      def.pixels = clonePlain(snapshot.pixels || []);
      if (snapshot.accentPixels?.length) def.accentPixels = clonePlain(snapshot.accentPixels);
      else delete def.accentPixels;
      editor.brushColor = snapshot.brushColor || def.color || editor.brushColor;
      editor.erasing = !!snapshot.erasing;
      scheduleAtlasRebuild();
    };

    container.innerHTML = `
      <div class="sprite-editor-detail-head">
        <h4 class="sprite-editor-detail-title">${entry.group} · ${entry.label}</h4>
        <div class="sprite-editor-detail-path">save to: assets/sprites/icons.js</div>
      </div>
      <p class="sprite-editor-note">Edits apply live this session. Download icons.js and replace the file to keep the change.</p>
      ${historyBarHtml()}
      <div class="sprite-editor-canvas-wrap"><canvas class="sprite-editor-canvas"></canvas></div>
      ${paletteStripHtml()}
      <div class="sprite-editor-toolbar">
        ${brushColorControlHtml(editor, def.color || '#ffffff')}
        <label><input type="checkbox" id="seEraser"> Eraser</label>
      </div>
      <div class="sprite-editor-actions">
        <button type="button" class="nav-btn nav-btn--minor" id="seDownload">Download icons.js</button>
        ${directSaveButtonHtml()}
        ${directSaveHintHtml()}
      </div>
    `;

    const canvas = container.querySelector('.sprite-editor-canvas');
    wireHistoryControls(editor, () => renderIconDetail(container, entry));
    renderPaletteStrip();
    wireBrushColorControl(container, editor);

    editor.applyPaletteColor = hex => {
      const color = normalizeHexColor(hex);
      if (!color) return;
      editor.brushColor = color;
      editor.erasing = false;
      const input = container.querySelector('#seBrushColor');
      if (input) input.value = color;
      const eraser = container.querySelector('#seEraser');
      if (eraser) eraser.checked = false;
    };

    canvas.width = ICON_GRID_SIZE * editor.scale;
    canvas.height = ICON_GRID_SIZE * editor.scale;
    repaintIconCanvas(canvas, def);

    function paintAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor((clientX - rect.left) / editor.scale);
      const cy = Math.floor((clientY - rect.top) / editor.scale);
      if (cx < 0 || cy < 0 || cx >= ICON_GRID_SIZE || cy >= ICON_GRID_SIZE) return;
      def.pixels = (def.pixels || []).filter(([x, y]) => !(x === cx && y === cy));
      def.accentPixels = (def.accentPixels || []).filter(([x, y]) => !(x === cx && y === cy));
      if (!editor.erasing) {
        def.color = currentBrushColor(editor, def.color || '#ffffff');
        def.pixels = [...def.pixels, [cx, cy]];
      }
      if (!def.accentPixels?.length) delete def.accentPixels;
      repaintIconCanvas(canvas, def);
      scheduleAtlasRebuild();
    }
    bindPaintDrag(canvas, paintAt, () => editor.captureSnapshot(), before => {
      pushHistory(editor, before, editor.captureSnapshot());
    });

    container.querySelector('#seEraser').addEventListener('change', e => { editor.erasing = e.target.checked; });
    container.querySelector('#seDownload').addEventListener('click', () => downloadDataFile('icons'));
    container.querySelector('#seSaveDirect')?.addEventListener('click', e => saveDataFile('icons', e.currentTarget, editor));
  }

  function repaintIconCanvas(canvas, def) {
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / ICON_GRID_SIZE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = def.color || '#ffffff';
    (def.pixels || []).forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, cell, cell));
    if (def.accent && def.accentPixels) {
      ctx.fillStyle = def.accent;
      def.accentPixels.forEach(([x, y]) => ctx.fillRect(x * cell, y * cell, cell, cell));
    }
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 1; i < ICON_GRID_SIZE; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }
  }

  // ── Detail: raster environment tile editor ──────────────────────────────
  function renderEnvTileDetail(container, entry) {
    const def = entry.def;
    if (!state.editor || state.editor.entry.id !== entry.id) {
      ensureEnvTileRaster(def);
      state.editor = {
        kind: 'env-tile',
        entry,
        activeSwatch: Object.keys(def.palette || {})[0] || 'a',
        erasing: false,
        scale: 16,
      };
    }
    const editor = state.editor;
    ensureEnvTileRaster(def);
    const letters = Object.keys(def.palette || {});
    const fallbackBrush = def.palette[editor.activeSwatch] || def.palette[letters[0]] || '#ffffff';
    editor.brushColor = currentBrushColor(editor, fallbackBrush);
    editor.captureSnapshot = () => ({
      palette: { ...(def.palette || {}) },
      pixels: [...(def.pixels || [])],
      activeSwatch: editor.activeSwatch,
      brushColor: editor.brushColor,
      erasing: editor.erasing,
    });
    editor.applySnapshot = snapshot => {
      if (!snapshot) return;
      def.pixelSize = 16;
      def.palette = { ...snapshot.palette };
      def.pixels = [...snapshot.pixels];
      editor.activeSwatch = snapshot.activeSwatch || Object.keys(def.palette || {})[0] || 'a';
      editor.brushColor = snapshot.brushColor || def.palette[editor.activeSwatch] || editor.brushColor;
      editor.erasing = !!snapshot.erasing;
      rebuildEnvironmentPreviewState();
    };
    container.innerHTML = `
      <div class="sprite-editor-detail-head">
        <h4 class="sprite-editor-detail-title">${entry.label}</h4>
        <div class="sprite-editor-detail-path">${entry.propSprite ? 'prop sprite' : `kind: ${def.kind || 'unknown'}`}</div>
      </div>
      ${historyBarHtml()}
      <div class="sprite-editor-canvas-wrap"><canvas class="sprite-editor-canvas" width="256" height="256"></canvas></div>
      ${paletteStripHtml()}
      <div class="sprite-editor-toolbar">
        ${brushColorControlHtml(editor, fallbackBrush)}
        <label><input type="checkbox" id="seEraser" ${editor.erasing ? 'checked' : ''}> Eraser</label>
      </div>
      <div class="sprite-editor-actions">
        <button type="button" class="nav-btn nav-btn--minor" id="seDownload">Download environment.js</button>
        ${directSaveButtonHtml()}
        ${directSaveHintHtml()}
      </div>
    `;
    const canvas = container.querySelector('canvas');
    wireHistoryControls(editor, () => renderEnvTileDetail(container, entry));
    renderPaletteStrip();
    wireBrushColorControl(container, editor);
    const repaint = () => {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      repaintEnvRasterCanvas(canvas, def);
      rebuildEnvironmentPreviewState();
      renderGrid();
    };
    function pointerToCell(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(15, Math.round((clientX - rect.left) / rect.width * 16 - 0.5))),
        y: Math.max(0, Math.min(15, Math.round((clientY - rect.top) / rect.height * 16 - 0.5))),
      };
    }
    function paintAt(clientX, clientY) {
      const p = pointerToCell(clientX, clientY);
      if (!editor.erasing) {
        editor.activeSwatch = findOrCreatePaletteKey(def.palette, editor.brushColor, editor.activeSwatch);
      }
      const nextChar = editor.erasing ? '.' : editor.activeSwatch;
      const row = def.pixels[p.y] || '................';
      if (row[p.x] === nextChar) return;
      def.pixels[p.y] = row.slice(0, p.x) + nextChar + row.slice(p.x + 1);
      repaint();
    }
    bindPaintDrag(canvas, paintAt, () => editor.captureSnapshot(), before => {
      pushHistory(editor, before, editor.captureSnapshot());
    });
    editor.applyPaletteColor = hex => {
      const color = normalizeHexColor(hex);
      if (!color) return;
      editor.brushColor = color;
      editor.erasing = false;
      const input = container.querySelector('#seBrushColor');
      if (input) input.value = color;
      const eraser = container.querySelector('#seEraser');
      if (eraser) eraser.checked = false;
    };
    container.querySelector('#seEraser').addEventListener('change', e => {
      editor.erasing = e.target.checked;
    });
    container.querySelector('#seDownload').addEventListener('click', () => downloadDataFile('environment'));
    container.querySelector('#seSaveDirect')?.addEventListener('click', e => saveDataFile('environment', e.currentTarget, editor));
    repaint();
  }

  function ensureEnvTileRaster(def) {
    if (!def.palette) {
      def.palette = {
        a: def.base || '#343832',
        b: def.shade || '#252823',
        c: def.edge || '#4c5047',
        d: def.mortar || '#1c1f1d',
      };
    }
    if (!Array.isArray(def.pixels) || def.pixels.length !== 16) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const oldPixels = def.pixels;
      delete def.pixels;
      Neo.drawEnvironmentTileAsset?.(ctx, 0, 0, 16, def);
      if (oldPixels) def.pixels = oldPixels;
      const data = ctx.getImageData(0, 0, 16, 16).data;
      const palette = { ...def.palette };
      const colorToKey = new Map(Object.entries(palette).map(([key, value]) => [String(value).toLowerCase(), key]));
      const nextKeys = 'abcdefghijklmnopqrstuvwxyz';
      const rows = [];
      for (let y = 0; y < 16; y += 1) {
        let row = '';
        for (let x = 0; x < 16; x += 1) {
          const i = (y * 16 + x) * 4;
          if (data[i + 3] === 0) { row += '.'; continue; }
          const hex = `#${[data[i], data[i + 1], data[i + 2]].map(n => n.toString(16).padStart(2, '0')).join('')}`;
          let key = colorToKey.get(hex.toLowerCase());
          if (!key) {
            key = nextKeys.split('').find(candidate => !palette[candidate]) || 'z';
            palette[key] = hex;
            colorToKey.set(hex.toLowerCase(), key);
          }
          row += key;
        }
        rows.push(row);
      }
      def.palette = palette;
      def.pixels = rows;
    }
    def.pixelSize = 16;
  }

  function repaintEnvRasterCanvas(canvas, def) {
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / 16;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (def.pixels || []).forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const p = row[x];
        if (p === '.') continue;
        ctx.fillStyle = def.palette?.[p] || '#ff00ff';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    });
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    for (let i = 1; i < 16; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }
  }

  function rebuildEnvironmentPreviewState() {
    if (typeof Neo.buildEnvironmentTileAtlas === 'function') Neo.ENV_TILE_ATLAS = Neo.buildEnvironmentTileAtlas();
    Neo.environmentBackgroundCache = { key: '', canvas: null };
  }

  // ── Save export helpers (data-file categories) ───────────────────────────
  function findObjectLiteralSpan(text, marker) {
    const start = text.indexOf(marker);
    if (start === -1) return null;
    const braceStart = text.indexOf('{', start);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          let end = i + 1;
          if (text[end] === ';') end += 1;
          return { start, end };
        }
      }
    }
    return null;
  }

  function serializePixelRow(row) {
    return `      '${row}',`;
  }

  function serializeActorDefs() {
    const defs = Neo.SPRITE_DEFS || {};
    const lines = ['window.NeoNykeSpriteDefs = {'];
    Object.keys(defs).forEach(key => {
      const def = defs[key];
      if (!def?.pixels || !def?.palette) return;
      lines.push(`  ${key}: {`);
      const paletteEntries = Object.keys(def.palette).map(k => `${k}: '${def.palette[k]}'`).join(', ');
      lines.push(`    palette: { ${paletteEntries} },`);
      lines.push('    pixels: [');
      def.pixels.forEach(row => lines.push(serializePixelRow(row)));
      lines.push('    ],');
      lines.push('  },');
    });
    lines.push('};');
    return lines.join('\n');
  }

  function serializePixelPairs(pairs) {
    // Group into rows of ~8 for readability, matching the source file's style.
    const chunks = [];
    for (let i = 0; i < pairs.length; i += 8) chunks.push(pairs.slice(i, i + 8));
    return chunks.map(chunk => `        ${chunk.map(([x, y]) => `[${x},${y}]`).join(',')},`).join('\n');
  }

  function serializeIconDefs() {
    const groups = window.NeoNykeIconDefs || {};
    const lines = ['window.NeoNykeIconDefs = {'];
    Object.keys(groups).forEach(group => {
      lines.push(`  ${group}: {`);
      const entries = groups[group] || {};
      Object.keys(entries).forEach(key => {
        const def = entries[key];
        if (!def?.pixels) return;
        lines.push(`    ${key}: {`);
        lines.push(`      color: '${def.color}',`);
        if (def.accent) lines.push(`      accent: '${def.accent}',`);
        lines.push('      pixels: [');
        lines.push(serializePixelPairs(def.pixels));
        lines.push('      ],');
        if (def.accent && def.accentPixels?.length) {
          lines.push('      accentPixels: [');
          lines.push(serializePixelPairs(def.accentPixels));
          lines.push('      ],');
        }
        lines.push('    },');
      });
      lines.push('  },');
    });
    lines.push('};');
    return lines.join('\n');
  }

  function serializeCharacterSheetDefs() {
    const defs = Neo.CHARACTER_SHEET_DEFS || {};
    const lines = ['const CHARACTER_SHEET_DEFS = {'];
    Object.keys(defs).forEach(key => {
      const def = defs[key];
      const sheet = Neo.CHARACTER_SPRITE_SHEETS?.[key] || {};
      lines.push(`  ${key}: {`);
      lines.push(`    src: '${def.src}',`);
      lines.push(`    frameWidth: ${def.frameWidth},`);
      lines.push(`    frameHeight: ${def.frameHeight},`);
      lines.push(`    frameCount: ${def.frameCount},`);
      lines.push(`    renderScale: ${def.renderScale ?? 1},`);
      const idleFrames = sheet.idleFrames ?? def.idleFrames ?? [0];
      if (JSON.stringify(idleFrames) !== JSON.stringify([0])) {
        lines.push(`    idleFrames: [${idleFrames.join(', ')}],`);
      }
      const walkFrames = sheet.walkFrames ?? def.walkFrames;
      const defaultWalk = Array.from({ length: def.frameCount }, (_, i) => i).filter(i => !idleFrames.includes(i));
      if (Array.isArray(walkFrames) && JSON.stringify(walkFrames) !== JSON.stringify(defaultWalk)) {
        lines.push(`    walkFrames: [${walkFrames.join(', ')}],`);
      }
      const armFrame = sheet.armFrame ?? def.armFrame;
      if (Number.isInteger(armFrame)) lines.push(`    armFrame: ${armFrame},`);
      const armBaseAngle = sheet.armBaseAngle ?? def.armBaseAngle;
      if (armBaseAngle != null) lines.push(`    armBaseAngle: ${Number(armBaseAngle)},`);
      const armPivot = sheet.armPivot ?? def.armPivot;
      if (armPivot && Number.isFinite(Number(armPivot.x)) && Number.isFinite(Number(armPivot.y))) {
        lines.push(`    armPivot: { x: ${Number(armPivot.x)}, y: ${Number(armPivot.y)} },`);
      }
      const armOffset = sheet.armOffset ?? def.armOffset;
      if (armOffset && Number.isFinite(Number(armOffset.x)) && Number.isFinite(Number(armOffset.y))) {
        lines.push(`    armOffset: { x: ${Number(armOffset.x)}, y: ${Number(armOffset.y)} },`);
      }
      const portraitFrame = sheet.portraitFrame ?? def.portraitFrame;
      if (Number.isInteger(portraitFrame) && portraitFrame !== idleFrames[0]) lines.push(`    portraitFrame: ${portraitFrame},`);
      const stepRate = sheet.stepRate ?? def.stepRate;
      if (stepRate != null) lines.push(`    stepRate: ${stepRate},`);
      const idleRate = sheet.idleRate ?? def.idleRate;
      if (idleRate != null) lines.push(`    idleRate: ${idleRate},`);
      lines.push('  },');
    });
    lines.push('};');
    return lines.join('\n');
  }

  function serializeEnvironmentDefs() {
    const root = window.NeoNykeEnvironmentTileDefs || { sourceSize: 16, tiles: {} };
    return `window.NeoNykeEnvironmentTileDefs = ${JSON.stringify(root, null, 2)};`;
  }

  const DATA_FILE_INFO = {
    combatants: {
      path: 'assets/sprites/combatants.js',
      marker: 'window.NeoNykeSpriteDefs = ',
      serialize: serializeActorDefs,
    },
    icons: {
      path: 'assets/sprites/icons.js',
      marker: 'window.NeoNykeIconDefs = ',
      serialize: serializeIconDefs,
    },
    characterSheets: {
      path: 'js/draw/character-sheets.js',
      marker: 'const CHARACTER_SHEET_DEFS = ',
      serialize: serializeCharacterSheetDefs,
    },
    environment: {
      path: 'assets/sprites/environment.js',
      marker: 'window.NeoNykeEnvironmentTileDefs = ',
      serialize: serializeEnvironmentDefs,
    },
  };

  async function buildDataFile(which) {
    const info = DATA_FILE_INFO[which];
    const newLiteral = info.serialize();
    const res = await fetch(`${info.path}?_edit=${Date.now()}`);
    if (!res.ok) throw new Error(`Couldn't read ${info.path}`);
    const source = await res.text();
    const span = findObjectLiteralSpan(source, info.marker);
    return { info, text: span ? (source.slice(0, span.start) + newLiteral + source.slice(span.end)) : newLiteral };
  }

  async function saveDataFile(which, button, editor = state.editor) {
    button.disabled = true;
    try {
      const output = await buildDataFile(which);
      await saveEditorFile(output.info.path, output.text);
      button.textContent = 'Saved';
      markDirty(editor, false);
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = 'Save to Game';
        if (button.dataset.historySave === 'true') button.disabled = !editor?.dirty;
      }, 1200);
    }
  }

  async function downloadDataFile(which) {
    const info = DATA_FILE_INFO[which];
    try {
      const output = await buildDataFile(which);
      const { info, text: finalText } = output;
      const blob = new Blob([finalText], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = basename(info.path);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Couldn't read ${info.path} to export it — make sure the game is running through a local server.`);
    }
  }

  // ── Detail dispatch ───────────────────────────────────────────────────────
  function renderDetail() {
    stopPreview();
    const { detail } = getEls();
    const entry = state.selectedId ? findEntry(state.selectedId) : null;
    if (!entry) {
      detail.innerHTML = '<div class="sprite-editor-empty">Select a sprite from the list to edit it.</div>';
      return;
    }
    if (entry.kind === 'image-strip') renderImageStripDetail(detail, entry);
    else if (entry.kind === 'pixel-grid') renderActorDetail(detail, entry);
    else if (entry.kind === 'icon-grid') renderIconDetail(detail, entry);
    else if (entry.kind === 'env-tile') renderEnvTileDetail(detail, entry);
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  async function open() {
    const { panel, search } = getEls();
    if (!panel) return;
    state.open = true;
    await detectDirectSave();
    state.catalog = buildCatalog();
    state.selectedId = '';
    state.editor = null;
    if (search) search.value = '';
    state.query = '';
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    renderTabs();
    renderGrid();
    renderDetail();
    renderPaletteStrip();
    loadDefaultPalette();
  }

  function close() {
    stopPreview();
    const { panel } = getEls();
    if (!panel) return;
    state.open = false;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }

  function wireStaticEvents() {
    const { backdrop, closeBtn, search } = getEls();
    backdrop?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);
    search?.addEventListener('input', e => { state.query = e.target.value || ''; renderGrid(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.open) close();
      const key = e.key.toLowerCase();
      if (!state.open || !state.editor) return;
      const target = e.target;
      const isTextInput = target?.matches?.('input, textarea, [contenteditable="true"]');
      if (isTextInput) return;
      if (key === 'e' && !(e.ctrlKey || e.metaKey || e.altKey)) {
        const eraser = document.getElementById('seEraser');
        if (!eraser) return;
        e.preventDefault();
        eraser.checked = true;
        eraser.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (key !== 'z' && key !== 'y') return;
      e.preventDefault();
      const undo = document.getElementById('seUndo');
      const redo = document.getElementById('seRedo');
      if (key === 'y' || (key === 'z' && e.shiftKey)) redo?.click();
      else undo?.click();
    });
    wirePaletteLoader();
  }

  wireStaticEvents();
  Neo.openSpriteEditor = open;
  Neo.closeSpriteEditor = close;

  if (new URLSearchParams(window.location.search).get('sprite-editor') === 'standalone') {
    document.documentElement.classList.add('sprite-editor-standalone');
    window.addEventListener('load', () => open(), { once: true });
  }
})();
