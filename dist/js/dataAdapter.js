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

  function normalizeImportPayload(data) {
    const modernStores = data?.indexedDB?.[DB_NAME]?.stores;
    if (modernStores && typeof modernStores === 'object') {
      return {
        localStorage: data.localStorage || {},
        stores: modernStores,
      };
    }

    const saves = [];
    if (data && 'meta' in data) saves.push({ key: 'meta', value: data.meta });
    if (data && 'run' in data) saves.push({ key: 'run', value: data.run });
    if (data && 'runHistory' in data) saves.push({ key: 'runHistory', value: data.runHistory });

    return {
      localStorage: data?.localStorage || {},
      stores: {
        saves,
        achievements: Array.isArray(data?.achievements)
          ? data.achievements.map(value => ({ key: value?.id, value })).filter(record => record.key)
          : [],
      },
    };
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
        stores[storeName] = await exportStore(db, storeName);
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
    window.__neoDataResetting = true;
    const payload = normalizeImportPayload(data);
    importLocalStorage(payload.localStorage);
    const db = await openDB();
    try {
      await Promise.all(IDB_STORES.map(storeName => importStore(db, storeName, payload.stores?.[storeName] || [])));
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
