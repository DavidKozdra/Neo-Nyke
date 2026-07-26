const { resolveCampaignEliteProfile, resolveCampaignEliteCrit, resolveCampaignElitePlayerHitProcs, resolveCampaignEnemyAggressionHit } = require('../js/simulation/SharedEliteSystem');

describe('shared campaign elite profile', () => {
  test('applies inventory, body, and power traits in campaign order', () => {
    const profile = resolveCampaignEliteProfile({
      maxHealth: 100, health: 100, damage: 20, moveSpeed: 100, radius: 10, attackCooldown: 1,
    }, {
      tokens: ['knight', 'knave', 'enflamed', 'breezy', 'gross', 'giant', 'blessed', 'lazered'],
      inventory: {
        insurance: 1, turtle_shell: 1, iron_lung: 1, neo_knife: 1, orb_of_blood: 1,
        crit_charm: 1, oracles_lens: 1, attack_servo: 1, charged_adapter: 1,
        anchor_charm: 1, tough_bandaid: 1,
      },
      statusKeys: ['bleed'], random: () => 0.5,
    });

    expect(profile).toEqual(expect.objectContaining({
      maxHealth: 408, health: 408, damage: 40, radius: 15, attackCooldown: 0.9,
      eliteBody: { knight: 1, knave: 1 }, eliteKnightMult: 1.15, eliteUnfazed: 1,
      elitePowers: ['enflamed', 'breezy', 'gross', 'giant', 'blessed', 'lazered'],
      eliteProcs: { fire: 0.12, cold: 0.12, poison: 0.12 }, eliteCrit: 0.18,
      eliteLaserModeIndex: 0, eliteDurabilityV2: true,
    }));
    expect(profile.moveSpeed).toBeCloseTo(108.192);
    expect(profile.statusResistances).toEqual({ bleed: 0.01, slow: 0.22 });
    expect(profile.eliteLaserCd).toBeCloseTo(1.35);
  });

  test('rolls level-based token counts from one deterministic random stream', () => {
    const profile = resolveCampaignEliteProfile(
      { maxHealth: 40, health: 40, damage: 10, moveSpeed: 100, radius: 10, attackCooldown: 1 },
      { level: 4, random: () => 0, inventoryPool: ['insurance'], whiteItemPool: ['neo_knife'] },
    );
    expect(profile.eliteTypes).toEqual(['knight', 'lazered']);
    expect(profile.eliteInventory).toEqual({ insurance: 2 });
  });

  test('uses campaign elite crit and player-status proc rules', () => {
    expect(resolveCampaignEliteCrit({ elite: true, eliteCrit: 0.18 }, { random: () => 0 }))
      .toEqual({ isCrit: true, chance: 0.18, multiplier: 1.4 });
    expect(resolveCampaignElitePlayerHitProcs(
      { eliteProcs: { fire: 0.2, poison: 0.2, cold: 0.2 } },
      { itemStats: { negativeStatusMultiplier: 1 } }, { random: () => 0 },
    )).toEqual([
      { key: 'fire', stacks: 1, duration: 2.8, damageMultiplier: 1 },
      { key: 'poison', stacks: 1, duration: 4.2, damageMultiplier: 1 },
      { key: 'slow', stacks: 1, duration: 4, damageMultiplier: 1 },
    ]);
  });

  test('applies enemy time aggression except on exempt or authored-crit sources', () => {
    const aggressive = resolveCampaignEnemyAggressionHit({ damage: 10, elapsedSeconds: 300, random: () => 0 });
    expect(aggressive).toEqual(expect.objectContaining({ isCrit: true, applied: true }));
    expect(aggressive.damage).toBeCloseTo(16.275);
    expect(resolveCampaignEnemyAggressionHit({ damage: 10, elapsedSeconds: 300, sourceKey: 'lava', random: () => 0 }))
      .toEqual(expect.objectContaining({ damage: 10, isCrit: false, applied: false }));
    expect(resolveCampaignEnemyAggressionHit({
      damage: 10, elapsedSeconds: 300, enemy: { elite: true, eliteCrit: 0.18 }, random: () => 0,
    })).toEqual(expect.objectContaining({ damage: 10, isCrit: false, applied: false }));
  });
});
