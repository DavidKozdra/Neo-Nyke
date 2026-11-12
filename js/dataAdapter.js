(function NeoDataAdapterModule() {
  const DB_NAME = 'NeoNykeDB';
  const DB_VERSION = 2;
  const LOCAL_PREFIX = 'neonyke:';
  const IDB_STORES = ['saves', 'achievements'];

  function openDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        if (!db.objectStoreNames.contains('achievements')) db.createObjectStore('achievements', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('failed to open client data store'));
    });
  }

  function closeDB(db) {
    try { db?.close?.(); } catch {}
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('failed to encode stored blob'));
      reader.readAsDataURL(blob);
    });
  }

  async function serializeStoreRecords(records) {
    return Promise.all(records.map(async record => {
      if (!(record?.value?.blob instanceof Blob)) return record;
      return {
        ...record,
        value: {
          ...record.value,
          blob: {
            __neoSerializedBlob: true,
            type: record.value.blob.type,
            dataUrl: await blobToDataUrl(record.value.blob),
          },
        },
      };
    }));
  }

  async function deserializeStoreRecords(records) {
    return Promise.all((Array.isArray(records) ? records : []).map(async record => {
      const encoded = record?.value?.blob;
      if (!encoded?.__neoSerializedBlob || typeof encoded.dataUrl !== 'string') return record;
      const response = await fetch(encoded.dataUrl);
      return {
        ...record,
        value: {
          ...record.value,
          blob: await response.blob(),
        },
      };
    }));
  }

  function exportLocalStorage() {
    if (typeof localStorage === 'undefined') return {};
    const snapshot = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(LOCAL_PREFIX)) snapshot[key] = localStorage.getItem(key);
    }
    return snapshot;
  }

  function clearLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(LOCAL_PREFIX)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  }

  function importLocalStorage(snapshot) {
    clearLocalStorage();
    if (!snapshot || typeof snapshot !== 'object') return;
    Object.entries(snapshot).forEach(([key, value]) => {
      if (key.startsWith(LOCAL_PREFIX) && typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    });
  }

  function exportStore(db, storeName) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const records = [];
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        records.push({ key: cursor.primaryKey, value: cursor.value });
        cursor.continue();
      };
      tx.oncomplete = () => resolve(records);
      tx.onerror = () => reject(tx.error || new Error(`failed to export ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`aborted ${storeName} export`));
    });
  }

  function importStore(db, storeName, records) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve();
    const safeRecords = Array.isArray(records) ? records : [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const hasInlineKey = !!store.keyPath;
      store.clear();
      safeRecords.forEach(record => {
        if (!record || !('value' in record)) return;
        if (hasInlineKey) store.put(record.value);
        else store.put(record.value, record.key);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`failed to import ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`aborted ${storeName} import`));
    });
  }

  function clearStore(db, storeName) {
    if (!db || !db.objectStoreNames.contains(storeName)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`failed to clear ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`aborted ${storeName} clear`));
    });
  }

  function getSaveRecord(records, key) {
    return records.find(record => record?.key === key)?.value ?? null;
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function requireValidImport(condition) {
    if (!condition) throw new TypeError('Invalid or unsupported NEO NYKE save file.');
  }

  function validateSaveValue(key, value) {
    if (key === 'meta' || key === 'run') requireValidImport(value === null || isRecord(value));
    if (key === 'runHistory') requireValidImport(value === null || (Array.isArray(value) && value.every(isRecord)));
  }

  function validateImportPayload(payload) {
    requireValidImport(isRecord(payload.localStorage));
    for (const [key, value] of Object.entries(payload.localStorage)) {
      requireValidImport(key.startsWith(LOCAL_PREFIX) && typeof value === 'string');
    }
    for (const storeName of IDB_STORES) {
      const records = payload.stores[storeName];
      requireValidImport(Array.isArray(records));
      for (const record of records) {
        requireValidImport(isRecord(record) && typeof record.key === 'string' && record.key.length > 0
          && Object.hasOwn(record, 'value'));
        if (storeName === 'achievements') {
          requireValidImport(isRecord(record.value) && record.value.id === record.key);
        } else {
          validateSaveValue(record.key, record.value);
        }
        const encoded = record.value?.blob;
        if (encoded?.__neoSerializedBlob) {
          requireValidImport(encoded.__neoSerializedBlob === true && typeof encoded.type === 'string'
            && typeof encoded.dataUrl === 'string' && /^data:[^,]*,/i.test(encoded.dataUrl));
        }
      }
    }
    return payload;
  }

  function normalizeImportPayload(data) {
    requireValidImport(isRecord(data));
    if (Object.hasOwn(data, 'format')) requireValidImport(data.format === 'neonyke-client-data' && Object.hasOwn(data, 'version'));
    if (Object.hasOwn(data, 'version')) requireValidImport(Number.isInteger(data.version) && data.version >= 1 && data.version <= 3);
    if (data.format === 'neonyke-client-data' && data.version === 3) requireValidImport(Object.hasOwn(data, 'indexedDB'));
    if (Object.hasOwn(data, 'indexedDB')) {
      const database = data.indexedDB?.[DB_NAME];
      requireValidImport(isRecord(database) && isRecord(database.stores));
      if (Object.hasOwn(database, 'version')) requireValidImport(Number.isInteger(database.version)
        && database.version >= 1 && database.version <= DB_VERSION);
      return validateImportPayload({
        localStorage: data.localStorage ?? {},
        stores: database.stores,
      });
    }

    // Older exports used top-level save values instead of IndexedDB records.
    // An arbitrary JSON object must never become an empty replacement save.
    requireValidImport(Object.hasOwn(data, 'meta') && Object.hasOwn(data, 'run'));
    const saves = [];
    for (const key of ['meta', 'run', 'runHistory']) {
      if (Object.hasOwn(data, key)) saves.push({ key, value: data[key] });
    }
    if (Object.hasOwn(data, 'achievements')) requireValidImport(Array.isArray(data.achievements));

    return validateImportPayload({
      localStorage: data.localStorage ?? {},
      stores: {
        saves,
        achievements: (data.achievements || []).map(value => ({ key: value?.id, value })),
      },
    });
  }

  async function flushAchievementWrites() {
    if (typeof achievementManager !== 'undefined' && typeof achievementManager.exportAll === 'function') {
      try { await achievementManager.exportAll(); } catch {}
    }
  }

  async function exportAll() {
    await flushAchievementWrites();
    const db = await openDB();
    try {
      const stores = {};
      await Promise.all(IDB_STORES.map(async storeName => {
        stores[storeName] = await serializeStoreRecords(await exportStore(db, storeName));
      }));
      const saves = stores.saves || [];
      return {
        format: 'neonyke-client-data',
        version: 3,
        exportedAt: new Date().toISOString(),
        localStorage: exportLocalStorage(),
        indexedDB: {
          [DB_NAME]: {
            version: DB_VERSION,
            stores,
          },
        },
        meta: getSaveRecord(saves, 'meta'),
        run: getSaveRecord(saves, 'run'),
        runHistory: getSaveRecord(saves, 'runHistory'),
        achievements: (stores.achievements || []).map(record => record.value),
      };
    } finally {
      closeDB(db);
    }
  }

  async function importAll(data) {
    const payload = normalizeImportPayload(data);
    // Decode every embedded sprite before clearing anything: malformed data
    // URLs can fail asynchronously even after the record shapes pass validation.
    const stores = Object.fromEntries(await Promise.all(IDB_STORES.map(async storeName => [
      storeName, await deserializeStoreRecords(payload.stores[storeName]),
    ])));
    const db = await openDB();
    const wasResetting = window.__neoDataResetting;
    window.__neoDataResetting = true;
    try {
      importLocalStorage(payload.localStorage);
      await Promise.all(IDB_STORES.map(storeName => importStore(db, storeName, stores[storeName])));
    } catch (error) {
      window.__neoDataResetting = wasResetting;
      throw error;
    } finally {
      closeDB(db);
    }
  }

  async function deleteAll() {
    window.__neoDataResetting = true;
    clearLocalStorage();
    const db = await openDB();
    try {
      await Promise.all(IDB_STORES.map(storeName => clearStore(db, storeName)));
    } finally {
      closeDB(db);
    }
  }

  window.NeoDataAdapter = { exportAll, importAll, deleteAll };
})();
