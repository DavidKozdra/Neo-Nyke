  function createSaveStore() {
    const localPrefix = 'neonyke:';
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
    let dbPromise = null;
    const SaveApiCtor = KozSaveApi.SaveAPI || null;
    const createLocalStorageDriver = KozStorageDrivers.createLocalStorageDriver || null;

    function createFallbackApi(key) {
      if (!SaveApiCtor || !createLocalStorageDriver) return null;
      try {
        return new SaveApiCtor({
          driver: createLocalStorageDriver(localStorage),
          key: localPrefix + key,
        });
      } catch (error) {
        return null;
      }
    }

    function openDb() {
      if (!idb) return Promise.reject(new Error('IndexedDB unavailable'));
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = idb.open('NeoNykeDB', 2);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('saves')) {
            request.result.createObjectStore('saves');
          }
          if (!request.result.objectStoreNames.contains('achievements')) {
            request.result.createObjectStore('achievements', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function idbGet(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readonly');
        const store = tx.objectStore('saves');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    }

    async function idbPut(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function idbDelete(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const fallback = {
      async get(key) {
        const api = createFallbackApi(key);
        if (api) return api.load();
        const raw = localStorage.getItem(localPrefix + key);
        return raw ? JSON.parse(raw) : null;
      },
      async put(key, value) {
        const api = createFallbackApi(key);
        if (api) {
          api.save(value);
          return;
        }
        localStorage.setItem(localPrefix + key, JSON.stringify(value));
      },
      async delete(key) {
        const api = createFallbackApi(key);
        if (api) {
          api.delete();
          return;
        }
        localStorage.removeItem(localPrefix + key);
      },
    };

    return {
      kind: idb ? 'IDB READY' : 'LOCAL ONLY',
      async get(key) {
        if (!idb) return fallback.get(key);
        try {
          return await idbGet(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.get(key);
        }
      },
      async put(key, value) {
        if (!idb) return fallback.put(key, value);
        try {
          return await idbPut(key, value);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.put(key, value);
        }
      },
      async delete(key) {
        if (!idb) return fallback.delete(key);
        try {
          return await idbDelete(key);
        } catch (error) {
          this.kind = 'LOCAL ONLY';
          return fallback.delete(key);
        }
      },
    };
  }

