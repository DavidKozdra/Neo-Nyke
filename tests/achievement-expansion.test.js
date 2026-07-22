const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const definitionsSource = fs.readFileSync(path.join(root, 'js/achievements.js'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'js/achievementManager.js'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'js/game/hud.js'), 'utf8');
const specialRoomsSource = fs.readFileSync(path.join(root, 'js/game/specialRooms.js'), 'utf8');

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
    Neo: {
      gameMode: 'normal',
      CHARACTER_DEFS: {
        princess: {}, thorn_knight: {}, metao: {}, gelleh: {}, mooggy: {}, turtle_boy: {}, sarge: {}, custom_character: {},
      },
      CHALLENGE_TRIAL_TYPES: ['mirror', 'circuit', 'bombs', 'ward', 'runes', 'storm'],
      recordAchievementUnlock() {},
    },
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await manager.isUnlocked(id)) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${id}`);
}

describe('expanded achievements', () => {
  test('registers the eight mode and system mastery achievements', () => {
    const { achievements } = loadDefinitions();
    const ids = new Set(achievements.map(achievement => achievement.id));
    [
      'the_long_haul',
      'rush_hour',
      'crown_thief',
      'mortal_no_more',
      'against_all_odds',
      'master_huntsman',
      'relic_alchemist',
      'seven_heroes_one_crown',
    ].forEach(id => expect(ids.has(id)).toBe(true));
  });

  test('exposes progress for every multi-step addition', () => {
    const { progress } = loadDefinitions();
    expect(progress.the_long_haul).toMatchObject({ key: 'maxEndlessWave', target: 20 });
    expect(progress.against_all_odds).toMatchObject({ key: 'maxActiveChallengesWon', target: 3 });
    expect(progress.master_huntsman).toMatchObject({ key: 'runBountyTypesCompleted', target: 3 });
    expect(progress.relic_alchemist).toMatchObject({ key: 'runReliquaryServicesUsed', target: 3 });
    expect(progress.seven_heroes_one_crown).toMatchObject({ key: 'heroWins', target: 7 });
  });

  test('tracks the correct run events and excludes custom heroes', () => {
    expect(managerSource).toContain("if (maxEndlessWave >= 20) await unlock('the_long_haul')");
    expect(managerSource).toContain("if (gameMode === 'boss_rush') await unlock('rush_hour')");
    expect(managerSource).toContain("if (gameMode === 'treasure_hunt') await unlock('crown_thief')");
    expect(managerSource).toContain("if (difficulty === 'god') await unlock('mortal_no_more')");
    expect(managerSource).toContain("if (challengeCount >= 3) await unlock('against_all_odds')");
    expect(managerSource).toContain("achievementEvents.on('bounty:completed'");
    expect(managerSource).toContain("achievementEvents.on('reliquary:used'");
    expect(managerSource).toContain("key !== 'custom_character'");
  });

  test('victories and successful special-room outcomes provide required context', () => {
    expect(hudSource).toContain('difficulty: Neo.selectedDifficulty');
    expect(hudSource).toContain('challengeKeys: [...(Neo.selectedChallenges || [])]');
    expect(hudSource).toContain('characterKey: Neo.chosenCharacter');
    expect(specialRoomsSource).toContain("emit('bounty:completed', { contractType: bounty.contractType, kind })");
    expect(specialRoomsSource).toContain("emit('reliquary:used', { service: choiceId })");
  });

  test('unlocks all eight achievements through their real event contracts', async () => {
    const window = createAchievementHarness();
    const emit = (name, data = {}) => window.achievementEvents.emit(name, data);

    emit('endless:wave', { wave: 20 });
    emit('run:won', { elapsedSeconds: 600, playerHp: 100, gameMode: 'boss_rush', difficulty: 'medium', challengeKeys: [], characterKey: 'princess' });
    emit('run:won', { elapsedSeconds: 600, playerHp: 100, gameMode: 'treasure_hunt', difficulty: 'medium', challengeKeys: [], characterKey: 'thorn_knight' });
    emit('run:won', { elapsedSeconds: 600, playerHp: 100, gameMode: 'normal', difficulty: 'god', challengeKeys: ['no_hit', 'no_items', 'swarm_rooms'], characterKey: 'metao' });
    ['gelleh', 'mooggy', 'turtle_boy', 'sarge'].forEach(characterKey => {
      emit('run:won', { elapsedSeconds: 600, playerHp: 100, gameMode: 'normal', difficulty: 'medium', challengeKeys: [], characterKey });
    });
    ['execution', 'capture', 'theft'].forEach(contractType => emit('bounty:completed', { contractType }));
    ['fuse', 'distill', 'echo'].forEach(service => emit('reliquary:used', { service }));

    await Promise.all([
      'the_long_haul',
      'rush_hour',
      'crown_thief',
      'mortal_no_more',
      'against_all_odds',
      'master_huntsman',
      'relic_alchemist',
      'seven_heroes_one_crown',
    ].map(id => waitForUnlock(window.achievementManager, id)));

    const progress = await window.achievementManager.getProgressSnapshot();
    expect(progress).toMatchObject({
      maxEndlessWave: 20,
      maxActiveChallengesWon: 3,
      runBountyTypesCompleted: 3,
      runReliquaryServicesUsed: 3,
      heroWins: 7,
    });
  });
});
