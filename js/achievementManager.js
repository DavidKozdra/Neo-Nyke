const achievementEvents = (() => {
  const listeners = {};
  return {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    emit(event, payload) {
      (listeners[event] || []).forEach(fn => fn(payload));
    },
  };
})();

const achievementManager = (() => {
  const DB_NAME = 'NeoNykeDB';
  const STORE = 'achievements';
  let db = null;
  const cumulativeCounts = new Map();
  const pendingCumulativeWrites = new Map();
  let cumulativeFlushTimer = 0;
  let cumulativeFlushPromise = Promise.resolve();

  // Per-run counters
  let statusesApplied = new Set();
  let runHealTotal = 0;
  let runDamageTaken = 0;
  let runShopBuys = 0;

  function openDB() {
    return new Promise((resolve, reject) => {
      // Open at same version as game.js (2) — store already created there
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('saves')) {
          d.createObjectStore('saves');
        }
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async function getDB() {
    if (!db) db = await openDB();
    return db;
  }

  async function isUnlocked(id) {
    const d = await getDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readCumulativeCountFromStore(id) {
    const d = await getDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id + '_count');
      req.onsuccess = () => resolve(req.result ? req.result.value : 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCumulativeCount(id) {
    if (cumulativeCounts.has(id)) return cumulativeCounts.get(id);
    const count = await readCumulativeCountFromStore(id);
    cumulativeCounts.set(id, count);
    return count;
  }

  function scheduleCumulativeFlush(delay = 300) {
    clearTimeout(cumulativeFlushTimer);
    cumulativeFlushTimer = setTimeout(() => {
      cumulativeFlushTimer = 0;
      void flushPendingCumulativeWrites();
    }, delay);
  }

  function flushPendingCumulativeWrites() {
    if (pendingCumulativeWrites.size === 0) return cumulativeFlushPromise;

    const snapshot = [...pendingCumulativeWrites.entries()];
    pendingCumulativeWrites.clear();

    cumulativeFlushPromise = cumulativeFlushPromise
      .then(async () => {
        const d = await getDB();
        await new Promise((resolve, reject) => {
          const tx = d.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          snapshot.forEach(([id, value]) => {
            store.put({ id: id + '_count', value });
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('failed to flush cumulative counts'));
          tx.onabort = () => reject(tx.error || new Error('aborted cumulative count flush'));
        });
      })
      .catch(error => {
        console.error('Failed to flush achievement counters', error);
        snapshot.forEach(([id, value]) => {
          pendingCumulativeWrites.set(id, value);
        });
        scheduleCumulativeFlush(500);
      });

    return cumulativeFlushPromise;
  }

  async function incrementCumulativeCount(id, delta = 1) {
    const current = await getCumulativeCount(id);
    const next = current + delta;
    cumulativeCounts.set(id, next);
    pendingCumulativeWrites.set(id, next);
    scheduleCumulativeFlush();
    return next;
  }

  async function unlock(id) {
    if (await isUnlocked(id)) return;
    const d = await getDB();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put({ id, unlockedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (def) {
      pushAchievementToast(def);
      window.dispatchEvent(new CustomEvent('achievement:unlocked', { detail: { id } }));
    }
  }

  function resetRunCounters() {
    statusesApplied = new Set();
    runHealTotal = 0;
    runDamageTaken = 0;
    runShopBuys = 0;
  }

  // --- Event handlers ---

  achievementEvents.on('damage:dealt', async ({ amount }) => {
    if (amount >= 10000) await unlock('one_punch_man');
  });

  achievementEvents.on('status:applied', async ({ key }) => {
    statusesApplied.add(key);
    if (statusesApplied.size >= 4) await unlock('the_avatar');
  });

  achievementEvents.on('rival:killed', async () => {
    const count = await incrementCumulativeCount('rival_kills');
    if (count >= 100) await unlock('rival_rumble');
  });

  achievementEvents.on('run:won', async ({ elapsedSeconds, playerHp }) => {
    if (elapsedSeconds <= 300) await unlock('gotta_meet_god');
    if (runDamageTaken === 0) await unlock('unkillable');
    if (playerHp <= 1) await unlock('glass_cannon');
  });

  achievementEvents.on('heal:applied', async ({ amount }) => {
    runHealTotal += amount;
    if (runHealTotal >= 343) await unlock('yeshua_is_king');
  });

  achievementEvents.on('damage:taken', async ({ amount }) => {
    runDamageTaken += amount;
  });

  achievementEvents.on('item:collected', async ({ totalItems }) => {
    if (totalItems >= 10) await unlock('hoarder');
  });

  achievementEvents.on('floor:reached', async ({ floor }) => {
    if (floor >= 10) await unlock('floor_muncher');
  });

  achievementEvents.on('player:leveled', async ({ level }) => {
    if (level >= 20) await unlock('overleveled');
  });

  achievementEvents.on('shop:bought', async () => {
    runShopBuys += 1;
    if (runShopBuys >= 5) await unlock('shopping_spree');
  });

  achievementEvents.on('loop:completed', async ({ loopIndex }) => {
    if (loopIndex >= 3) await unlock('loop_lord');
  });

  achievementEvents.on('meta:coins', async ({ total }) => {
    if (total >= 1000) await unlock('coin_goblin');
  });

  achievementEvents.on('god:killed', async () => {
    const count = await incrementCumulativeCount('gods_killed');
    if (count >= 10) await unlock('god_slayer');
  });

  achievementEvents.on('enemy:killed', async () => {
    const count = await incrementCumulativeCount('enemies_killed');
    if (count >= 1000) await unlock('extinction');
  });

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingCumulativeWrites();
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
      void flushPendingCumulativeWrites();
    });
  }

  return { isUnlocked, unlock, resetRunCounters };
})();

function pushAchievementToast(achievement) {
  let stack = document.getElementById('itemNotifyStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'itemNotifyStack';
    document.body.appendChild(stack);
  }

  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = '#ffd27d';

  const icon = document.createElement('div');
  icon.className = 'item-toast-icon';
  icon.textContent = String(achievement?.icon || '🏆');
  icon.style.display = 'grid';
  icon.style.placeItems = 'center';
  icon.style.fontSize = '18px';
  icon.style.lineHeight = '1';
  icon.style.background = 'rgba(8, 14, 22, 0.88)';

  const body = document.createElement('div');
  body.className = 'item-toast-body';

  const title = document.createElement('div');
  title.className = 'item-toast-title';
  title.textContent = 'ACHIEVEMENT UNLOCKED';

  const plus = document.createElement('div');
  plus.className = 'item-toast-amount';
  plus.textContent = `+1 LC • ${String(achievement?.name || 'Achievement')}`;

  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.textContent = String(achievement?.desc || 'Unlocked');

  body.append(title, plus, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.childElementCount > 4) stack.lastElementChild?.remove();

  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  }, 4400);
}
