const {
  ITEM_RARITY_BY_KEY,
  BLACK_ITEM_UNLOCK_LOOP_INDEX,
  rollCampaignItem,
  createCampaignItemChoices,
  createTreasureChestPlan,
} = require('../js/simulation/SharedItemContent');
const { areBlackItemsUnlocked } = require('../js/simulation/LoopContentSystem');

const BLACK_KEYS = Object.entries(ITEM_RARITY_BY_KEY)
  .filter(([, rarity]) => rarity === 'black')
  .map(([key]) => key);

// A stream that always picks the last slice of every weighted range is the
// worst case for this gate: it lands on the rarest tier every time.
const maxRandom = () => 0.999999;

describe('BLACK relics stay locked until the loop campaign unlocks them', () => {
  test('the drop table actually contains BLACK relics to gate', () => {
    expect(BLACK_KEYS.length).toBeGreaterThan(0);
  });

  test('loop 6 is the first loop that unlocks them', () => {
    expect(BLACK_ITEM_UNLOCK_LOOP_INDEX).toBe(5);
    expect(areBlackItemsUnlocked(0)).toBe(false);
    expect(areBlackItemsUnlocked(4)).toBe(false); // loop 5
    expect(areBlackItemsUnlocked(5)).toBe(true);  // loop 6
    expect(areBlackItemsUnlocked(19)).toBe(true);
  });

  test('rollCampaignItem never returns a BLACK relic below the unlock loop', () => {
    for (let loopIndex = 0; loopIndex < BLACK_ITEM_UNLOCK_LOOP_INDEX; loopIndex += 1) {
      [false, true].forEach(elite => {
        const key = rollCampaignItem(maxRandom, { runLoopIndex: loopIndex, elite });
        expect(key).toBeTruthy();
        expect(BLACK_KEYS).not.toContain(key);
      });
    }
  });

  test('rollCampaignItem can return a BLACK relic once unlocked', () => {
    const key = rollCampaignItem(maxRandom, { runLoopIndex: BLACK_ITEM_UNLOCK_LOOP_INDEX });
    expect(BLACK_KEYS).toContain(key);
  });

  test('an explicit allowBlackItems flag overrides the loop derivation both ways', () => {
    expect(BLACK_KEYS).not.toContain(rollCampaignItem(maxRandom, { runLoopIndex: 19, allowBlackItems: false }));
    expect(BLACK_KEYS).toContain(rollCampaignItem(maxRandom, { runLoopIndex: 0, allowBlackItems: true }));
  });

  test('multi-choice offers and treasure chests inherit the gate', () => {
    const choices = createCampaignItemChoices(8, maxRandom, { allowBlackItems: false });
    expect(choices.length).toBeGreaterThan(0);
    choices.forEach(key => expect(BLACK_KEYS).not.toContain(key));

    const chests = createTreasureChestPlan({
      random: maxRandom,
      floorNumber: 9,
      itemChance: 1,
      allowBlackItems: false,
      geometry: { width: 900, height: 700, wallThickness: 24 },
    });
    expect(chests.length).toBeGreaterThan(0);
    chests.forEach(chest => {
      if (chest.rewardKey) expect(BLACK_KEYS).not.toContain(chest.rewardKey);
      (chest.rewardChoices || []).forEach(key => expect(BLACK_KEYS).not.toContain(key));
    });
  });

  test('pools with no loop context keep the whole table available', () => {
    expect(BLACK_KEYS).toContain(rollCampaignItem(maxRandom));
  });
});

// The browser gate lives in game-state.js, which is a browser bundle rather than
// a CommonJS module. Lift the two predicates out of the source and run them, so
// this covers real behaviour instead of just asserting on text.
const fs = require('node:fs');
const path = require('node:path');

function loadBrowserGate() {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const slice = body => {
    const start = source.indexOf(`function ${body}(`);
    if (start < 0) throw new Error(`${body} is missing from game-state.js`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    }
    throw new Error(`${body} is unbalanced`);
  };
  // eslint-disable-next-line no-new-func
  return new Function('Neo', 'globalThis', `
    ${slice('isMetaProgressBlockedMode')}
    ${slice('areBlackItemsUnlocked')}
    return areBlackItemsUnlocked;
  `);
}

describe('the browser gate exempts Practice and Sandbox', () => {
  const makeGate = loadBrowserGate();
  const simulation = { areBlackItemsUnlocked };
  const gateFor = (gameMode, runLoopIndex) =>
    makeGate({ gameMode, runLoopIndex }, { NeoNyke: { simulation } })();

  test('normal runs follow the loop rule', () => {
    expect(gateFor('normal', 0)).toBe(false);
    expect(gateFor('normal', 4)).toBe(false);
    expect(gateFor('normal', 5)).toBe(true);
  });

  test('Practice and Sandbox always allow BLACK relics', () => {
    ['practice', 'sandbox'].forEach(mode => {
      expect(gateFor(mode, 0)).toBe(true);
      expect(gateFor(mode, 5)).toBe(true);
    });
  });
});
