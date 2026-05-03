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

  async function getCumulativeCount(id) {
    const d = await getDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id + '_count');
      req.onsuccess = () => resolve(req.result ? req.result.value : 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function setCumulativeCount(id, value) {
    const d = await getDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put({ id: id + '_count', value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
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
    let count = await getCumulativeCount('rival_kills');
    count += 1;
    await setCumulativeCount('rival_kills', count);
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
    let count = await getCumulativeCount('gods_killed');
    count += 1;
    await setCumulativeCount('gods_killed', count);
    if (count >= 10) await unlock('god_slayer');
  });

  achievementEvents.on('enemy:killed', async () => {
    let count = await getCumulativeCount('enemies_killed');
    count += 1;
    await setCumulativeCount('enemies_killed', count);
    if (count >= 1000) await unlock('extinction');
  });

  return { isUnlocked, unlock, resetRunCounters };
})();

// Grant a loop crystal when any achievement is unlocked
window.addEventListener('achievement:unlocked', () => {
  if (typeof metaProgress !== 'undefined' && typeof persistMetaSoon === 'function') {
    metaProgress.loopCrystals = Number(metaProgress.loopCrystals || 0) + 1;
    persistMetaSoon();
  }
});

function pushAchievementToast(achievement) {
  const container = document.getElementById('notification-container')
    || (() => {
      const el = document.createElement('div');
      el.id = 'notification-container';
      document.body.appendChild(el);
      return el;
    })();

  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <div class="achievement-toast-label">ACHIEVEMENT UNLOCKED &nbsp;+1 💎</div>
    <div class="achievement-toast-body">
      <span class="achievement-toast-icon">${achievement.icon}</span>
      <div class="achievement-toast-text">
        <div class="achievement-toast-name">${achievement.name}</div>
        <div class="achievement-toast-desc">${achievement.desc}</div>
      </div>
    </div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('achievement-toast--visible'));

  setTimeout(() => {
    toast.classList.remove('achievement-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 6000);
}
