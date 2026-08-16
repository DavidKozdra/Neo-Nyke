const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const gameStateSource = fs.readFileSync(path.join(root, 'js/core/game-state.js'), 'utf8');
const gameCoreSource = fs.readFileSync(path.join(root, 'js/core/game-core.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'js/game/combat.js'), 'utf8');
const roomsSource = fs.readFileSync(path.join(root, 'js/game/rooms.js'), 'utf8');
const enemiesSource = fs.readFileSync(path.join(root, 'js/game/enemies.js'), 'utf8');
const panelsSource = fs.readFileSync(path.join(root, 'js/ui/panels.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const { createCampaignChallengeRewardPlan } = require('../js/simulation/SharedRoomLifecycleSystem');

// Pull a top-level function out of a source file so it can be exercised in
// isolation, the way the other UI-free tests in this repo do.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  let index = source.indexOf('{', start);
  const bodyStart = index;
  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name} at ${bodyStart}`);
}

function loadPlanNormalizer() {
  const source = [
    "const CHAOS_PLAN_ROOM_TYPES = new Set(['start', 'exit', 'combat', 'treasure', 'shop', 'anvil']);",
    extractFunction(gameStateSource, 'isChaosPlanConnected'),
    extractFunction(gameStateSource, 'normalizeChaosFirstFloorPlan'),
    'return normalizeChaosFirstFloorPlan;',
  ].join('\n');
  return new Function(source)();
}

describe('chaos mods', () => {
  test('every chaos mod is defined, priced, and reachable from the mods panel', () => {
    const keys = ['random_character', 'random_loadout', 'enemy_reincarnation', 'random_enemy_levels', 'authored_first_floor'];
    keys.forEach(key => {
      expect(gameCoreSource).toContain(`${key}: {`);
      expect(indexSource).toContain(`data-chaos="${key}"`);
    });
    expect(indexSource).toContain('data-mods-tab="chaos"');
    const chaosBlock = gameCoreSource.slice(
      gameCoreSource.indexOf('export const CHAOS_DEFS'),
      gameCoreSource.indexOf('export const CHAOS_ORDER'),
    );
    // Every mod must carry an unlock cost, so none is silently free.
    expect(chaosBlock.match(/\bcost:/g) || []).toHaveLength(keys.length);
    // But chaos never grants a crystal payout — that is what still separates it
    // from challenges, which are rewarded for being harder.
    expect(chaosBlock).not.toMatch(/\breward:/);
  });

  test('the pure-upside mods cost more than the double-edged rerolls', () => {
    const costOf = key => {
      const start = gameCoreSource.indexOf(`${key}: {`);
      return Number(/\bcost: (\d+)/.exec(gameCoreSource.slice(start, start + 400))?.[1]);
    };
    // Reincarnation is a free life per floor and Architect is a hand-drawn
    // opening floor; both are strictly good for the player, so they must be
    // gated harder than the rerolls that cut both ways.
    const cheapest = Math.min(costOf('random_character'), costOf('random_loadout'), costOf('random_enemy_levels'));
    expect(costOf('enemy_reincarnation')).toBeGreaterThan(cheapest * 2);
    expect(costOf('authored_first_floor')).toBeGreaterThan(cheapest * 2);
  });

  test('chaos mods are bought once and then toggle free', () => {
    const handler = panelsSource.slice(
      panelsSource.indexOf('onChaosSelect('),
      panelsSource.indexOf('onAdvanceDialogue('),
    );
    expect(handler).toContain('Neo.getOwnedChaosSet()');
    expect(handler).toContain('loopCrystals || 0) < def.cost');
    expect(handler).toContain('Neo.metaProgress.unlockedChaos');
    // Once owned, clicking only flips selection and must not charge again.
    expect(handler).toContain('Neo.selectedChaos.filter(key => key !== chaosKey)');
  });

  test('an unowned chaos mod can never stay selected', () => {
    expect(gameStateSource).toContain('Neo.selectedChaos = normalizeChaosSelection(Neo.selectedChaos).filter(key => ownedChaos.has(key))');
  });

  test('chaos mods grant no Loop Crystal bonus', () => {
    const bonusFn = extractFunction(gameStateSource, 'getActiveChallengeCrystalBonusMultiplier');
    expect(bonusFn).not.toContain('selectedChaos');
    expect(bonusFn).not.toContain('CHAOS_DEFS');
  });

  test('story and tutorial runs start with no chaos active', () => {
    expect(gameStateSource).toContain('Neo.selectedChaos = storyRun || shouldRunTutorial');
  });

  describe('Architect plan validation', () => {
    const normalize = loadPlanNormalizer();
    const connected = {
      gridSize: 9,
      cells: [
        { gx: 0, gy: 0, type: 'start' },
        { gx: 1, gy: 0, type: 'combat' },
        { gx: 1, gy: 1, type: 'exit' },
      ],
    };

    test('accepts a plan whose ladder is reachable from the start', () => {
      const plan = normalize(connected);
      expect(plan).not.toBeNull();
      expect(plan.cells).toHaveLength(3);
    });

    test('rejects a plan with no start or no ladder', () => {
      expect(normalize({ cells: [{ gx: 0, gy: 0, type: 'start' }] })).toBeNull();
      expect(normalize({ cells: [{ gx: 0, gy: 0, type: 'exit' }] })).toBeNull();
    });

    test('rejects an unreachable ladder, including a diagonal-only chain', () => {
      expect(normalize({
        cells: [{ gx: 0, gy: 0, type: 'start' }, { gx: 4, gy: 4, type: 'exit' }],
      })).toBeNull();
      // Diagonal neighbours do not share a wall, so they are not connected.
      expect(normalize({
        cells: [{ gx: 0, gy: 0, type: 'start' }, { gx: 1, gy: 1, type: 'exit' }],
      })).toBeNull();
    });

    test('drops out-of-bounds cells, duplicates, and unknown room types', () => {
      const plan = normalize({
        gridSize: 9,
        cells: [
          { gx: 0, gy: 0, type: 'start' },
          { gx: 1, gy: 0, type: 'exit' },
          { gx: 1, gy: 0, type: 'combat' },
          { gx: 99, gy: 0, type: 'combat' },
          { gx: -1, gy: 0, type: 'combat' },
          { gx: 2, gy: 0, type: 'god' },
        ],
      });
      expect(plan.cells).toHaveLength(2);
      expect(plan.cells.some(cell => cell.type === 'god')).toBe(false);
      expect(plan.cells.filter(cell => cell.gx === 1 && cell.gy === 0)).toHaveLength(1);
    });

    test('rejects junk input rather than throwing', () => {
      expect(normalize(null)).toBeNull();
      expect(normalize({})).toBeNull();
      expect(normalize({ cells: 'nope' })).toBeNull();
    });
  });

  test('Architect only replaces generation on floor 1 of the first loop', () => {
    expect(roomsSource).toContain("Neo.isChaosActive?.('authored_first_floor')");
    expect(roomsSource).toContain('Neo.floor === 1 && Number(Neo.runLoopIndex || 0) === 0');
  });

  test('Lottery Levels bypasses the depth-based encounter level', () => {
    const rollFn = extractFunction(enemiesSource, 'rollEnemyEncounterLevel');
    expect(rollFn).toContain("Neo.isChaosActive?.('random_enemy_levels')");
    // The chaos branch must return before the depth/XP walk below it.
    expect(rollFn.indexOf('rollChaosEnemyLevel')).toBeLessThan(rollFn.indexOf('let xp ='));
  });

  test('the character swap preserves run progress and rescales health', () => {
    const swap = extractFunction(roomsSource, 'applyChaosCharacterSwap');
    // Level, XP, coins and items are never touched by a swap.
    ['level', 'xp', 'coins', 'items'].forEach(field => {
      expect(swap).not.toContain(`player.${field} =`);
    });
    expect(swap).toContain('hpFraction');
    expect(swap).toContain('nextMultiplier / previousMultiplier');
  });
});

describe('legacy upgrades', () => {
  test('all three upgrades are defined with a cost and shown in the panel', () => {
    ['scroll_scholar', 'first_light', 'voucher_economy'].forEach(key => {
      expect(gameCoreSource).toContain(`${key}: {`);
      expect(indexSource).toContain(`data-legacy="${key}"`);
    });
  });

  describe('Scroll Scholar', () => {
    const rewardOptions = {
      floorNumber: 6,
      rollScroll: () => 'scroll_reroll',
      rollEliteItem: () => 'neo_knife',
    };

    test('lifts the scroll chance from 20% to 30%', () => {
      // A roll at 0.25 misses the base 20% chance but lands inside the boosted 30%.
      const base = createCampaignChallengeRewardPlan({
        ...rewardOptions, scrollRandom: () => 0.25, random: () => 0.5,
      });
      expect(base.rewardKey).toBe('neo_knife');
      const boosted = createCampaignChallengeRewardPlan({
        ...rewardOptions, scrollChanceMultiplier: 1.5, scrollRandom: () => 0.25, random: () => 0.5,
      });
      expect(boosted.rewardKey).toBe('scroll_reroll');
    });

    test('an authored reward still wins over the boosted roll', () => {
      const plan = createCampaignChallengeRewardPlan({
        ...rewardOptions, authoredRewardKey: 'orb_of_blood',
        scrollChanceMultiplier: 1.5, scrollRandom: () => 0, random: () => 0.5,
      });
      expect(plan.rewardKey).toBe('orb_of_blood');
    });

    test('the boosted chance is clamped to certainty', () => {
      const plan = createCampaignChallengeRewardPlan({
        ...rewardOptions, scrollChanceMultiplier: 99, scrollRandom: () => 0.999, random: () => 0.5,
      });
      expect(plan.rewardKey).toBe('scroll_reroll');
    });
  });

  describe('pickup transforms', () => {
    const transform = extractFunction(combatSource, 'applyLegacyPickupTransforms');

    test('First Light fires once per run and only on knight relics', () => {
      expect(transform).toContain('!Neo.chaosFirstLightSpent');
      expect(transform).toContain("rarity === 'knight'");
      expect(transform).toContain('Neo.chaosFirstLightSpent = true');
      expect(gameStateSource).toContain('Neo.chaosFirstLightSpent = false');
    });

    test('vouchers and scrolls are never transformed', () => {
      expect(transform).toContain('item.voucher');
      expect(transform).toContain('Neo.isScrollControlItem');
    });

    test('Voucher Economy maps each rarity to its own voucher and leaves drop-only tiers alone', () => {
      const map = combatSource.slice(
        combatSource.indexOf('const LEGACY_VOUCHER_BY_RARITY'),
        combatSource.indexOf('};', combatSource.indexOf('const LEGACY_VOUCHER_BY_RARITY')),
      );
      expect(map).toContain("knight: 'voucher_white'");
      expect(map).toContain("wizard: 'voucher_purple'");
      expect(map).toContain("god: 'voucher_yellow'");
      // blue/green have no voucher tier and must not be silently downgraded.
      expect(map).not.toContain('blue:');
      expect(map).not.toContain('green:');
    });
  });
});
