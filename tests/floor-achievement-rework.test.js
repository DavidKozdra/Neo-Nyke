const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const definitionsSource = fs.readFileSync(path.join(root, 'js/achievements.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'js/achievementManager.js'), 'utf8');
const roomsSource = fs.readFileSync(path.join(root, 'js/game/rooms.js'), 'utf8');

function loadDefinitions() {
  const window = {};
  return new Function('window', `${definitionsSource}; return {
    achievements: window.ACHIEVEMENTS,
    progress: window.ACHIEVEMENT_PROGRESS,
  };`)(window);
}

function createIndexedDbStub() {
  const records = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { pending: 0, oncomplete: null, onerror: null, onabort: null };
      const finishRequest = (request, operation) => {
        tx.pending += 1;
        setImmediate(() => {
          try {
            request.result = operation();
            request.onsuccess?.({ target: request });
          } catch (error) {
            request.error = error;
            request.onerror?.({ target: request });
            tx.onerror?.({ target: tx });
          } finally {
            tx.pending -= 1;
            if (tx.pending === 0) setImmediate(() => tx.oncomplete?.({ target: tx }));
          }
        });
        return request;
      };
      tx.objectStore = () => ({
        get: id => finishRequest({}, () => records.get(id)),
        getAll: () => finishRequest({}, () => [...records.values()]),
        put: record => finishRequest({}, () => {
          records.set(record.id, structuredClone(record));
          return record.id;
        }),
        clear: () => finishRequest({}, () => records.clear()),
      });
      return tx;
    },
  };
  return {
    open() {
      const request = {};
      setImmediate(() => request.onsuccess?.({ target: { result: db } }));
      return request;
    },
  };
}

function createElementStub() {
  const element = {
    children: [],
    className: '',
    classList: { add() {} },
    style: {},
    append(...nodes) {
      nodes.forEach(node => { node.parentElement = this; });
      this.children.push(...nodes);
    },
    prepend(node) {
      node.parentElement = this;
      this.children.unshift(node);
    },
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    },
    get childElementCount() { return this.children.length; },
    get lastElementChild() { return this.children[this.children.length - 1]; },
  };
  return element;
}

function createAchievementHarness() {
  const stack = createElementStub();
  const window = {
    Neo: { gameMode: 'normal', player: {}, godTimer: 0, CHARACTER_DEFS: {}, recordAchievementUnlock() {} },
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = vm.createContext({
    window,
    indexedDB: createIndexedDbStub(),
    document: {
      getElementById: id => id === 'itemNotifyStack' ? stack : null,
      createElement: createElementStub,
      body: { appendChild() {} },
      addEventListener() {},
      visibilityState: 'visible',
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
    Map,
    Set,
    Promise,
  });
  vm.runInContext(`${definitionsSource}\n${managerSource}`, context);
  return window;
}

async function waitForUnlock(manager, id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await manager.isUnlocked(id)) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${id}`);
}

async function settle(steps = 40) {
  for (let attempt = 0; attempt < steps; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('floor achievement rework', () => {
  test('Floor Muncher is a lifetime 100-floor grind, not a single-run floor 10', () => {
    const { achievements, progress } = loadDefinitions();
    const muncher = achievements.find(achievement => achievement.id === 'floor_muncher');
    expect(muncher.desc).toBe('Reach 100 floors total');
    expect(progress.floor_muncher).toMatchObject({ key: 'floors_entered', target: 100 });
  });

  test('Gotta Meet God is a sub-5-minute sprint to floor 10, not a full clear', () => {
    const { achievements } = loadDefinitions();
    const speedrun = achievements.find(achievement => achievement.id === 'gotta_meet_god');
    expect(speedrun.desc).toBe('Reach floor 10 in under 5 minutes');
    // The old contract unlocked on the God kill; nothing may award it from run:won.
    expect(managerSource).not.toContain("elapsedSeconds <= 300) await unlock('gotta_meet_god')");
  });

  test('every floor entered counts once, from the single generateFloor choke point', () => {
    expect(roomsSource).toContain("window.achievementEvents?.emit('floor:reached'");
    expect(roomsSource).toContain('elapsedSeconds: Number(Neo.gameElapsedTime || 0)');
  });

  test('floor_muncher unlocks only after 100 cumulative floors across runs', async () => {
    const window = createAchievementHarness();
    const emit = (name, data = {}) => window.achievementEvents.emit(name, data);

    for (let floor = 1; floor <= 99; floor += 1) {
      emit('floor:reached', { floor: ((floor - 1) % 10) + 1, elapsedSeconds: 900 });
      await settle(4);
    }
    expect((await window.achievementManager.getProgressSnapshot()).floors_entered).toBe(99);
    expect(await window.achievementManager.isUnlocked('floor_muncher')).toBe(false);

    // A run boundary must not reset the tally — the 100th floor lands in a new run.
    window.achievementManager.resetRunCounters?.();
    emit('floor:reached', { floor: 1, elapsedSeconds: 5 });
    await waitForUnlock(window.achievementManager, 'floor_muncher');
  });

  test('gotta_meet_god needs floor 10 inside 5 minutes on the run clock', async () => {
    const slow = createAchievementHarness();
    slow.achievementEvents.emit('floor:reached', { floor: 10, elapsedSeconds: 301 });
    await settle();
    expect(await slow.achievementManager.isUnlocked('gotta_meet_god')).toBe(false);

    const shallow = createAchievementHarness();
    shallow.achievementEvents.emit('floor:reached', { floor: 9, elapsedSeconds: 60 });
    await settle();
    expect(await shallow.achievementManager.isUnlocked('gotta_meet_god')).toBe(false);

    const fast = createAchievementHarness();
    fast.achievementEvents.emit('floor:reached', { floor: 10, elapsedSeconds: 299 });
    await waitForUnlock(fast.achievementManager, 'gotta_meet_god');
  });

  test('a missing or zero run clock never awards the speedrun', async () => {
    const window = createAchievementHarness();
    window.achievementEvents.emit('floor:reached', { floor: 10 });
    window.achievementEvents.emit('floor:reached', { floor: 10, elapsedSeconds: 0 });
    await settle();
    expect(await window.achievementManager.isUnlocked('gotta_meet_god')).toBe(false);
  });
});
