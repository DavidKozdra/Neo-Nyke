const achievementEvents = (() => {
  const listeners = {};
  return {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    emit(event, payload) {
      if (window.Neo?.gameMode === 'practice') return;
      (listeners[event] || []).forEach(fn => fn(payload));
    },
  };
})();
window.achievementEvents = achievementEvents;

const achievementManager = (() => {
  const DB_NAME = 'NeoNykeDB';
  const STORE = 'achievements';
  let db = null;
  const cumulativeCounts = new Map();
  // Synchronous in-flight guard so two async unlock() calls for the same id
  // (fired close together) can't both pass the isUnlocked() check before either
  // commits its write — which previously showed the toast twice.
  const unlockingInFlight = new Set();
  const pendingCumulativeWrites = new Map();
  let cumulativeFlushTimer = 0;
  let cumulativeFlushPromise = Promise.resolve();

  // Per-run counters
  let statusesApplied = new Set();
  let statusesByEnemy = new Map();
  let runHealTotal = 0;
  let runDamageTaken = 0;
  let runShopBuys = 0;
  let bestHitDamage = 0;
  let maxRelicCount = 0;
  let maxFloorReached = 1;
  let maxPlayerLevel = 1;
  let maxLoopIndex = 0;
  let maxEndlessWave = 0;
  let metaCoins = 0;
  let runBowmanKills = 0;

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
    // Set synchronously (before any await) so concurrent calls bail out here.
    if (unlockingInFlight.has(id)) return;
    unlockingInFlight.add(id);
    try {
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
        window.Neo?.recordAchievementUnlock?.(def);
        window.dispatchEvent(new CustomEvent('achievement:unlocked', { detail: { id } }));
      }
    } finally {
      unlockingInFlight.delete(id);
    }
  }

  async function clearAll() {
    clearTimeout(cumulativeFlushTimer);
    cumulativeFlushTimer = 0;
    pendingCumulativeWrites.clear();
    cumulativeCounts.clear();
    resetRunCounters();
    metaCoins = 0;

    const d = await getDB();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('failed to clear achievements'));
      tx.onabort = () => reject(tx.error || new Error('aborted achievement clear'));
    });
  }

  async function exportAll() {
    await flushPendingCumulativeWrites();
    const d = await getDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('failed to export achievements'));
    });
  }

  async function importAll(records) {
    clearTimeout(cumulativeFlushTimer);
    cumulativeFlushTimer = 0;
    pendingCumulativeWrites.clear();
    cumulativeCounts.clear();
    resetRunCounters();
    metaCoins = 0;

    const safeRecords = Array.isArray(records)
      ? records.filter(record => record && typeof record.id === 'string')
      : [];
    const d = await getDB();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      safeRecords.forEach(record => store.put(record));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('failed to import achievements'));
      tx.onabort = () => reject(tx.error || new Error('aborted achievement import'));
    });
  }

  function resetRunCounters() {
    statusesApplied = new Set();
    statusesByEnemy = new Map();
    runHealTotal = 0;
    runDamageTaken = 0;
    runShopBuys = 0;
    bestHitDamage = 0;
    maxRelicCount = 0;
    maxFloorReached = 1;
    maxPlayerLevel = 1;
    maxLoopIndex = 0;
    maxEndlessWave = 0;
    runBowmanKills = 0;
  }

  async function getProgressSnapshot() {
    await flushPendingCumulativeWrites();
    const cumulativeIds = ['rival_kills', 'gods_killed', 'enemies_killed'];
    const cumulativeEntries = await Promise.all(
      cumulativeIds.map(async id => [id, await getCumulativeCount(id)])
    );
    return {
      ...Object.fromEntries(cumulativeEntries),
      statusesApplied: statusesApplied.size,
      runHealTotal,
      runDamageTaken,
      runShopBuys,
      bestHitDamage,
      maxRelicCount,
      maxFloorReached,
      maxPlayerLevel,
      maxLoopIndex,
      maxEndlessWave,
      metaCoins,
      runBowmanKills,
    };
  }

  // --- Event handlers ---

  achievementEvents.on('damage:dealt', async ({ amount }) => {
    bestHitDamage = Math.max(bestHitDamage, Math.max(0, Number(amount) || 0));
    if (amount >= 10000) await unlock('one_punch_man');
  });

  achievementEvents.on('status:applied', async ({ key, entityId }) => {
    statusesApplied.add(key);
    if (entityId != null) {
      if (!statusesByEnemy.has(entityId)) statusesByEnemy.set(entityId, new Set());
      statusesByEnemy.get(entityId).add(key);
      if (statusesByEnemy.get(entityId).size >= 4) await unlock('the_avatar');
    }
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
    maxRelicCount = Math.max(maxRelicCount, Math.max(0, Number(totalItems) || 0));
    if (totalItems >= 100) await unlock('hoarder');
  });

  achievementEvents.on('floor:reached', async ({ floor }) => {
    maxFloorReached = Math.max(maxFloorReached, Math.max(0, Number(floor) || 0));
    if (floor >= 10) await unlock('floor_muncher');
  });

  achievementEvents.on('endless:wave', ({ wave }) => {
    maxEndlessWave = Math.max(maxEndlessWave, Math.max(0, Number(wave) || 0));
  });

  achievementEvents.on('player:leveled', async ({ level }) => {
    maxPlayerLevel = Math.max(maxPlayerLevel, Math.max(0, Number(level) || 0));
    if (level >= 20) await unlock('overleveled');
  });

  achievementEvents.on('shop:bought', async () => {
    runShopBuys += 1;
    if (runShopBuys >= 50) await unlock('shopping_spree');
  });

  achievementEvents.on('loop:completed', async ({ loopIndex }) => {
    maxLoopIndex = Math.max(maxLoopIndex, Math.max(0, Number(loopIndex) || 0));
    if (loopIndex >= 3) await unlock('loop_lord');
  });

  achievementEvents.on('meta:coins', async ({ total }) => {
    metaCoins = Math.max(metaCoins, Math.max(0, Number(total) || 0));
    if (total >= 10000) await unlock('coin_goblin');
  });

  achievementEvents.on('god:killed', async () => {
    const count = await incrementCumulativeCount('gods_killed');
    if (count >= 10) await unlock('god_slayer');
  });

  achievementEvents.on('enemy:killed', async () => {
    const count = await incrementCumulativeCount('enemies_killed');
    if (count >= 1000) await unlock('extinction');
  });

  achievementEvents.on('bowman:killed', async () => {
    runBowmanKills += 1;
    if (runBowmanKills >= 2) await unlock('double_bane');
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

  return { isUnlocked, unlock, resetRunCounters, getProgressSnapshot, clearAll, exportAll, importAll };
})();
window.achievementManager = achievementManager;

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
  icon.style.fontSize = 'calc(18px * var(--font-scale, 1))';
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
