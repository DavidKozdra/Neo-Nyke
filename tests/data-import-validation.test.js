const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/dataAdapter.js'), 'utf8');

function createAdapter({ failOpen = false, failWrite = false, fetchImpl = jest.fn() } = {}) {
  const local = new Map([['neonyke:settings', '{"volume":20}'], ['other-app', 'keep']]);
  const stores = {
    saves: new Map([['meta', { coins: 123 }], ['run', { floor: 9 }]]),
    achievements: new Map([['first-win', { id: 'first-win', unlockedAt: 1234 }]]),
  };
  const db = {
    objectStoreNames: { contains: name => Object.hasOwn(stores, name) },
    close: jest.fn(),
    transaction: jest.fn((name, mode) => {
      if (failWrite && mode === 'readwrite') throw new Error('Storage unavailable');
      const tx = {};
      tx.objectStore = () => ({
        keyPath: name === 'achievements' ? 'id' : null,
        clear: () => stores[name].clear(),
        put: (value, key) => stores[name].set(key ?? value.id, value),
        openCursor: () => {
          const records = [...stores[name]];
          const request = {};
          let index = 0;
          function next() {
            const record = records[index++];
            request.result = record ? { primaryKey: record[0], value: record[1], continue: () => queueMicrotask(next) } : null;
            request.onsuccess();
            if (!record) tx.oncomplete();
          }
          queueMicrotask(next);
          return request;
        },
      });
      if (mode === 'readwrite') queueMicrotask(() => tx.oncomplete());
      return tx;
    }),
  };
  const indexedDB = { open: jest.fn(() => {
    const request = { result: db, error: new Error('Database unavailable') };
    queueMicrotask(() => failOpen ? request.onerror() : request.onsuccess());
    return request;
  }) };
  const localStorage = {
    get length() { return local.size; },
    key: index => [...local.keys()][index],
    getItem: key => local.get(key),
    setItem: jest.fn((key, value) => local.set(key, value)),
    removeItem: jest.fn(key => local.delete(key)),
  };
  const window = { __neoDataResetting: false };
  vm.runInNewContext(source, { window, indexedDB, localStorage, Blob, fetch: fetchImpl });
  function snapshot() {
    return { local: [...local].sort(), saves: [...stores.saves], achievements: [...stores.achievements] };
  }
  return { api: window.NeoDataAdapter, window, local, stores, indexedDB, db, localStorage, snapshot };
}

function modernBackup() {
  return {
    format: 'neonyke-client-data', version: 3,
    localStorage: { 'neonyke:settings': '{"volume":50}' },
    indexedDB: { NeoNykeDB: { version: 2, stores: {
      saves: [{ key: 'meta', value: { coins: 42 } }, { key: 'run', value: null }],
      achievements: [{ key: 'another-win', value: { id: 'another-win', unlockedAt: 5678 } }],
    } } },
  };
}

describe('save import validation', () => {
  test.each([
    null, {}, [], 42, 'save', { unrelated: true }, { localStorage: {} },
    { meta: {} }, { run: {} }, { achievements: [] },
    { meta: 'not a save' }, { run: [] }, { runHistory: {} }, { achievements: [null] },
    { meta: {}, localStorage: { 'other-app': 'overwrite' } },
    { meta: {}, localStorage: { 'neonyke:settings': 42 } },
  ])('rejects unrelated or malformed JSON without touching existing progress: %j', async data => {
    const adapter = createAdapter();
    const before = adapter.snapshot();

    await expect(adapter.api.importAll(data)).rejects.toThrow(/Invalid or unsupported/);

    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.indexedDB.open).not.toHaveBeenCalled();
    expect(adapter.localStorage.removeItem).not.toHaveBeenCalled();
    expect(adapter.window.__neoDataResetting).toBe(false);
  });

  test.each([
    data => { data.format = 'another-game'; },
    data => { delete data.version; },
    data => { data.version = 999; },
    data => { delete data.indexedDB; data.meta = {}; data.run = null; },
    data => { data.indexedDB.NeoNykeDB.version = 999; },
    data => { delete data.indexedDB.NeoNykeDB.stores.achievements; },
    data => { data.indexedDB.NeoNykeDB.stores.saves = {}; },
    data => { data.indexedDB.NeoNykeDB.stores.saves.push({ key: 'run' }); },
    data => { data.indexedDB.NeoNykeDB.stores.saves.push({ key: null, value: {} }); },
    data => { data.indexedDB.NeoNykeDB.stores.achievements[0].value = {}; },
    data => { data.indexedDB.NeoNykeDB.stores.saves.push({ key: 'sprite', value: { blob: { __neoSerializedBlob: true, type: 'image/png', dataUrl: 'https://other.test/image.png' } } }); },
  ])('rejects malformed backup records before clearing either store', async corrupt => {
    const adapter = createAdapter();
    const before = adapter.snapshot();
    const data = modernBackup();
    corrupt(data);

    await expect(adapter.api.importAll(data)).rejects.toThrow(/Invalid or unsupported/);

    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.indexedDB.open).not.toHaveBeenCalled();
    expect(adapter.window.__neoDataResetting).toBe(false);
  });

  test('round-trips the current export format, including settings and achievements', async () => {
    const original = createAdapter();
    const backup = JSON.parse(JSON.stringify(await original.api.exportAll()));
    const restored = createAdapter();
    restored.stores.saves.set('meta', { coins: 999 });

    await restored.api.importAll(backup);

    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.window.__neoDataResetting).toBe(true);
  });

  test('continues to import legacy top-level backups', async () => {
    const adapter = createAdapter();
    await adapter.api.importAll({
      meta: { coins: 7 }, run: null, runHistory: [{ floor: 3 }],
      achievements: [{ id: 'legacy-win', unlockedAt: 2345 }],
      localStorage: { 'neonyke:settings': '{"volume":70}' },
    });

    expect(adapter.stores.saves.get('meta')).toEqual({ coins: 7 });
    expect(adapter.stores.saves.get('run')).toBeNull();
    expect(adapter.stores.saves.get('runHistory')).toEqual([{ floor: 3 }]);
    expect(adapter.stores.achievements.has('legacy-win')).toBe(true);
    expect(adapter.local.get('other-app')).toBe('keep');
  });

  test('continues to accept untagged IndexedDB backups', async () => {
    const adapter = createAdapter();
    const data = modernBackup();
    delete data.format;
    delete data.version;
    await adapter.api.importAll(data);
    expect(adapter.stores.saves.get('meta')).toEqual({ coins: 42 });
    expect(adapter.stores.achievements.has('another-win')).toBe(true);
  });

  test('accepts an explicitly empty modern export', async () => {
    const adapter = createAdapter();
    const data = modernBackup();
    data.indexedDB.NeoNykeDB.stores = { saves: [], achievements: [] };
    await adapter.api.importAll(data);
    expect(adapter.stores.saves.size).toBe(0);
    expect(adapter.stores.achievements.size).toBe(0);
  });

  test('decodes embedded sprites before replacing any saved data', async () => {
    let adapter;
    const fetchImpl = jest.fn(async () => {
      expect(adapter.stores.saves.get('meta')).toEqual({ coins: 123 });
      expect(adapter.local.get('neonyke:settings')).toBe('{"volume":20}');
      return new Response('sprite', { headers: { 'Content-Type': 'image/png' } });
    });
    adapter = createAdapter({ fetchImpl });
    const data = modernBackup();
    data.indexedDB.NeoNykeDB.stores.saves.push({ key: 'sprite', value: {
      blob: { __neoSerializedBlob: true, type: 'image/png', dataUrl: 'data:image/png;base64,c3ByaXRl' },
    } });

    await adapter.api.importAll(data);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await adapter.stores.saves.get('sprite').blob.text()).toBe('sprite');
  });

  test('a sprite decode failure leaves all progress and autosaving intact', async () => {
    const adapter = createAdapter({ fetchImpl: jest.fn().mockRejectedValue(new Error('Invalid data URL')) });
    const before = adapter.snapshot();
    const data = modernBackup();
    data.indexedDB.NeoNykeDB.stores.saves.push({ key: 'sprite', value: {
      blob: { __neoSerializedBlob: true, type: 'image/png', dataUrl: 'data:image/png;base64,invalid' },
    } });

    await expect(adapter.api.importAll(data)).rejects.toThrow('Invalid data URL');

    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.indexedDB.open).not.toHaveBeenCalled();
    expect(adapter.window.__neoDataResetting).toBe(false);
  });

  test('checks database availability before clearing settings or suppressing saves', async () => {
    const adapter = createAdapter({ failOpen: true });
    const before = adapter.snapshot();
    await expect(adapter.api.importAll(modernBackup())).rejects.toThrow('Database unavailable');
    expect(adapter.snapshot()).toEqual(before);
    expect(adapter.window.__neoDataResetting).toBe(false);
  });

  test('restores the autosave guard if applying the import fails', async () => {
    const adapter = createAdapter({ failWrite: true });
    await expect(adapter.api.importAll(modernBackup())).rejects.toThrow('Storage unavailable');
    expect(adapter.window.__neoDataResetting).toBe(false);
  });
});
