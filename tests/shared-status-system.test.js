const fs = require('node:fs');
const path = require('node:path');
const {
  STATUS_EFFECT_KEYS,
  createCampaignStatusMap,
  ensureCampaignStatuses,
  applyCampaignStatus,
  getCampaignStatusStacks,
  getColdStacksFromDuration,
  getCampaignStatusTickDamage,
  getCampaignBleedResistance,
  getCampaignGenericStatusResistance,
  getCampaignSlowMultiplier,
  tickCampaignStatuses,
  resolveCampaignOnHitStatusProcs,
} = require('../js/simulation/SharedStatusSystem');

describe('shared campaign status system', () => {
  test('creates and repairs the one canonical status-map shape', () => {
    const statuses = createCampaignStatusMap();
    expect(Object.keys(statuses)).toEqual(STATUS_EFFECT_KEYS);
    expect(statuses.bleed).toEqual({ stacks: 0, duration: 0, tick: 0 });
    const entity = { statuses: { bleed: { stacks: '2', duration: '4', tick: '0.2' } } };
    ensureCampaignStatuses(entity);
    expect(entity.statuses.bleed).toEqual({ stacks: 2, duration: 4, tick: 0.2 });
    expect(entity.statuses.static).toEqual({ stacks: 0, duration: 0, tick: 0 });
  });

  test('applies resistance, the six-stack cap, duration refresh, ownership and proc power once', () => {
    const enemy = {};
    const first = applyCampaignStatus(enemy, 'bleed', 4, 3, {
      resistance: 0.25,
      ownerId: 'p1',
      damageMultiplier: 2.25,
    });
    expect(first).toEqual({ addedStacks: 3, stacks: 3, duration: 2.25 });
    applyCampaignStatus(enemy, 'bleed', 10, 1, { ownerId: 'p2' });
    expect(enemy.statuses.bleed).toEqual(expect.objectContaining({
      stacks: 6, duration: 2.25, ownerId: 'p2', damageMultiplier: 2.25,
    }));
    expect(getCampaignStatusStacks(enemy, 'bleed')).toBe(6);
  });

  test('uses the campaign player cold stack-time budget and decays visible stacks', () => {
    const player = {};
    applyCampaignStatus(player, 'slow', 2, 4, { playerColdBudget: true });
    expect(player.statuses.slow.duration).toBe(30);
    expect(getColdStacksFromDuration(30)).toBe(2);
    tickCampaignStatuses(player, 15.1, { keys: ['slow'], playerColdBudget: true });
    expect(player.statuses.slow.stacks).toBe(1);
    expect(player.statuses.slow.duration).toBeCloseTo(14.9);
    expect(getCampaignSlowMultiplier(player.statuses.slow.stacks)).toBeCloseTo(0.9);
  });

  test('fire halves the remaining freeze duration on enemies and players', () => {
    const enemy = {};
    applyCampaignStatus(enemy, 'slow', 2, 8);
    applyCampaignStatus(enemy, 'fire', 1, 3);
    expect(enemy.statuses.slow).toEqual(expect.objectContaining({ stacks: 2, duration: 4 }));

    const player = {};
    applyCampaignStatus(player, 'slow', 4, 4, { playerColdBudget: true });
    applyCampaignStatus(player, 'fire', 1, 3, { playerColdBudget: true });
    expect(player.statuses.slow).toEqual(expect.objectContaining({ stacks: 2, duration: 30 }));
  });

  test('owns exact enemy and player tick formulas and cadence', () => {
    expect(getCampaignStatusTickDamage('bleed', 2, 100)).toBeCloseTo(6.2);
    expect(getCampaignStatusTickDamage('fire', 2, 100)).toBeCloseTo(5.1);
    expect(getCampaignStatusTickDamage('poison', 2, 100)).toBeCloseTo(1.6);
    expect(getCampaignStatusTickDamage('bleed', 2, 100, { targetKind: 'player' })).toBeCloseTo(3.8);
    expect(getCampaignStatusTickDamage('fire', 2, 100, { targetKind: 'player', fireResistance: 0.25 })).toBeCloseTo(3.15);
    expect(getCampaignStatusTickDamage('poison', 2, 100, { targetKind: 'player' })).toBeCloseTo(0.9);

    const enemy = {};
    applyCampaignStatus(enemy, 'fire', 2, 2, { damageMultiplier: 1.5 });
    const ticks = [];
    tickCampaignStatuses(enemy, 0.05, {
      maxHp: 100,
      dealDamage: (key, raw) => { ticks.push([key, raw]); return raw; },
    });
    expect(ticks).toEqual([['fire', expect.closeTo(7.65)]]);
    tickCampaignStatuses(enemy, 0.4, { maxHp: 100, dealDamage: () => { throw new Error('early tick'); } });
    tickCampaignStatuses(enemy, 0.05, { maxHp: 100, dealDamage: (key, raw) => ticks.push([key, raw]) });
    expect(ticks).toHaveLength(2);
  });

  test('owns bleed and generic status resistance progression', () => {
    expect(getCampaignBleedResistance({}, { progressionDepth: 1, maxFloor: 10 })).toBe(1);
    expect(getCampaignBleedResistance({ elite: true, boss: true }, { progressionDepth: 12, maxFloor: 10 })).toBeCloseTo(3.66);
    expect(getCampaignBleedResistance({ mirrorExactCopy: true }, { progressionDepth: 99 })).toBe(1);
    expect(getCampaignGenericStatusResistance('poison', { statusResistScale: 0.5, elapsedSeconds: 600 })).toBeCloseTo(0.75);
    expect(getCampaignGenericStatusResistance('bleed', { statusResistScale: 1, elapsedSeconds: 6000 })).toBe(0);
  });

  test('resolves all campaign on-hit status procs in deterministic campaign order', () => {
    const procs = resolveCampaignOnHitStatusProcs({
      itemStats: {
        confuseRayStunChance: 1,
        confuseRayBlindChance: 1,
        snakeKnifePoisonChance: 1,
        weaponFatigueChance: 1,
        weaponFatigueFreezeChance: 1,
        overstimulateStunChance: 1,
      },
      hitOptions: { lightning: true, bleedChance: 1, fireChance: 1, itemBleedChance: 1 },
      activeStatusCount: 2,
      targetSlowStacks: 1,
      copperPennyStacks: 2,
      random: () => 0,
    });
    expect(procs.map(proc => proc.kind === 'status' ? proc.key : proc.presentation || proc.kind)).toEqual([
      'stun', 'blind', 'poison', 'slow', 'freeze', 'stimulated', 'shock', 'static', 'bleed', 'fire', 'bleed',
    ]);
    expect(procs.find(proc => proc.key === 'static')).toEqual(expect.objectContaining({ stacks: 3, duration: 4 }));
    expect(procs.find(proc => proc.key === 'poison')).toEqual(expect.objectContaining({ duration: 6, damageMultiplier: 1.5 }));
  });

  test('browser, authority and network presentation consume the shared operation and real map', () => {
    const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    const coreStatus = read('js/core/status.js');
    const combat = read('js/game/combat.js');
    const world = read('js/game/world.js');
    const authority = read('js/simulation/NetworkCombatSystem.js');
    const view = read('js/rendering/NetworkGameView.js');
    expect(coreStatus).toContain('simulation.applyCampaignStatus(');
    expect(combat).toContain('shared.resolveCampaignOnHitStatusProcs({');
    expect(combat).toContain('simulation.tickCampaignStatuses(enemy, dt, {');
    expect(world).toContain('simulation.tickCampaignStatuses(Neo.player, dt, {');
    expect(authority).toContain("require('./SharedStatusSystem.js')");
    expect(authority).toContain('tickCampaignStatuses(enemy, fixedDelta, {');
    expect(authority).not.toMatch(/bleedTicksRemaining|bleedDamage|bleedOwnerId|fireTicksRemaining|poisonTicksRemaining|frozenUntilTick/);
    expect(view).toContain('statuses: enemy.statuses ||');
    expect(view).not.toMatch(/bleedTicksRemaining|fireTicksRemaining|poisonTicksRemaining|frozenUntilTick/);
  });
});
