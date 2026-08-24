const fs = require('node:fs');
const path = require('node:path');
const definitions = require('../js/simulation/SharedItemDefinitions');
const itemContent = require('../js/simulation/SharedItemContent');
const {
  deriveCampaignItemStats,
  getBugCardHeavyHitThreshold,
  getDinoToothFreeOverrollMultiplier,
  getHeartOceanProjectileRequirement,
} = require('../js/simulation/SharedItemEffectSystem');
const { applyCampaignLevelUp } = require('../js/simulation/SharedProgressionSystem');
const { findCampaignProjectileEntitySweepHit } = require('../js/simulation/SharedProjectileSystem');
const {
  SEA_SNAKE_SEGMENT_SPACING,
  advanceCampaignSeaSnakeBody,
} = require('../js/simulation/SharedEnemyBehaviorSystem');
const { ALLY_SPRITE_KEY } = require('../js/simulation/SharedAllySystem');

describe('black relics', () => {
  test.each([
    ['bug_card', 'Ent of Pestilence'],
    ['dino_tooth', 'T-Rex'],
    ['heart_of_the_ocean', 'Snake of the Sea'],
  ])('%s is a black boss-bound relic', (key, bossName) => {
    expect(definitions.ITEM_DEFS[key]).toEqual(expect.objectContaining({ rarity: 'black', category: 'black' }));
    expect(definitions.ITEM_DEFS[key].description).toContain(bossName);
    expect(itemContent.ITEM_RARITY_BY_KEY[key]).toBe('black');
  });

  test('Dino Tooth doubles global damage and crit chance and adds a free over-roll', () => {
    const base = deriveCampaignItemStats({ items: { crit_charm: 1 }, level: 1, xp: 0, xpToNext: 20 });
    const dino = deriveCampaignItemStats({ items: { crit_charm: 1, dino_tooth: 1 }, level: 1, xp: 0, xpToNext: 20 });
    expect(dino.globalDamageMultiplier).toBe(2);
    expect(dino.critChance).toBeCloseTo(base.critChance * 2);
    expect(dino.critMultiplier).toBeGreaterThan(base.critMultiplier * 1.49);
    expect(getDinoToothFreeOverrollMultiplier(1)).toBe(1.5);
    expect(getDinoToothFreeOverrollMultiplier(2)).toBe(4.5);
    expect(getDinoToothFreeOverrollMultiplier(3)).toBe(13.5);
  });

  test('Bug Card awakens at a stack-scaled heavy-hit threshold and each ally boosts the team', () => {
    expect(getBugCardHeavyHitThreshold(1)).toBeCloseTo(0.10);
    expect(getBugCardHeavyHitThreshold(2)).toBeCloseTo(0.09);
    expect(getBugCardHeavyHitThreshold(20)).toBeCloseTo(0.01);
    expect(deriveCampaignItemStats({ items: { bug_card: 1 } }).globalDamageMultiplier).toBe(1);
    const owner = deriveCampaignItemStats({ items: { bug_card: 1 }, blackBugAllyCount: 3 });
    const teammate = deriveCampaignItemStats({ items: {}, blackBugTeamAllyCount: 3 });
    expect(owner.globalDamageMultiplier).toBeCloseTo(1.15);
    expect(owner.critChance).toBeCloseTo(0.15);
    expect(owner.bleedChance).toBeCloseTo(0.15);
    expect(teammate.globalDamageMultiplier).toBeCloseTo(1.15);
  });

  test('Dino Tooth doubles future level gains', () => {
    const player = { level: 1, xpToNext: 20, hp: 100, maxHp: 100, attackPower: 0, attackSpeed: 1, items: { dino_tooth: 1 } };
    const result = applyCampaignLevelUp(player);
    expect(result.levelBonusMultiplier).toBe(2);
    expect(player).toEqual(expect.objectContaining({ level: 2, hp: 130, maxHp: 130, attackPower: 6, attackSpeed: 1.02 }));
  });

  test('Heart stacks lower the echo requirement and empower every projectile', () => {
    const first = deriveCampaignItemStats({ items: { heart_of_the_ocean: 1 } });
    const second = deriveCampaignItemStats({ items: { heart_of_the_ocean: 2 } });
    expect(getHeartOceanProjectileRequirement(1)).toBe(2);
    expect(getHeartOceanProjectileRequirement(2)).toBe(1);
    expect(first).toEqual(expect.objectContaining({
      heartOceanProjectileRequirement: 2,
      projectileSpeedMultiplier: 1.2,
      projectileHomingStrength: 0.15,
      projectileBounces: 1,
    }));
    expect(second).toEqual(expect.objectContaining({
      heartOceanProjectileRequirement: 1,
      projectileSpeedMultiplier: 1.4,
      projectileHomingStrength: 0.3,
      projectileBounces: 2,
    }));
  });

  test('the sea snake body participates in swept projectile collision', () => {
    const snake = { id: 'snake', x: 400, y: 400, r: 30, collisionCircles: [{ x: 100, y: 50, r: 20 }] };
    const hit = findCampaignProjectileEntitySweepHit(
      { x: 130, y: 50, r: 4 }, { x: 60, y: 50 }, [snake],
    );
    expect(hit?.entity).toBe(snake);
    expect(hit?.x).toBeLessThan(100);
  });

  test('the sea snake continuously extrudes collidable tail sections from its portal', () => {
    const snake = {
      x: 200,
      y: 50,
      seaSnakeHole: { x: 0, y: 50, radius: 58 },
      seaSnakeSegments: [
        { x: 0, y: 50, r: 20 },
        { x: 0, y: 50, r: 20 },
        { x: 0, y: 50, r: 20 },
      ],
    };

    const first = advanceCampaignSeaSnakeBody(snake, 1);
    const firstLength = first.segments.length;
    expect(first.addedSegments).toBeGreaterThan(0);
    expect(snake.collisionCircles).toBe(snake.seaSnakeSegments);
    expect(snake.seaSnakeSegments.at(-1)).toEqual(expect.objectContaining({ x: 0, y: 50 }));

    snake.x = 400;
    const second = advanceCampaignSeaSnakeBody(snake, 1);
    expect(second.segments.length).toBeGreaterThan(firstLength);
    expect(second.segments.at(-1)).toEqual(expect.objectContaining({ x: 0, y: 50 }));

    for (let index = 1; index < second.segments.length; index += 1) {
      const previous = second.segments[index - 1];
      const segment = second.segments[index];
      expect(Math.hypot(segment.x - previous.x, segment.y - previous.y))
        .toBeLessThanOrEqual(SEA_SNAKE_SEGMENT_SPACING + 1e-8);
      expect(Number(previous.r) + Number(segment.r)).toBeGreaterThan(SEA_SNAKE_SEGMENT_SPACING);
    }

    second.segments.forEach(segment => {
      const hit = findCampaignProjectileEntitySweepHit(
        { x: segment.x + 30, y: segment.y, r: 2 },
        { x: segment.x - 30, y: segment.y },
        [snake],
      );
      expect(hit?.entity).toBe(snake);
    });
  });

  test('black relics re-summon their boss on every floor entered', () => {
    const enemies = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
    const rooms = fs.readFileSync(path.join(__dirname, '../js/game/rooms.js'), 'utf8');
    const network = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    // Campaign: generateFloor is the single choke point every floor entry runs
    // through (ladder, warp, floor-skip, loop reset), so the debt cannot be dodged.
    expect(enemies).toContain('function spawnBlackItemFloorBosses()');
    expect(enemies).toContain('Neo.spawnBlackItemFloorBosses = spawnBlackItemFloorBosses;');
    expect(rooms).toContain('Neo.spawnBlackItemFloorBosses?.()');
    // The tutorial runs an authored encounter script, so it stays exempt.
    expect(enemies).toMatch(/spawnBlackItemFloorBosses[\s\S]*?Neo\.isTutorialRun\?\.\(\)/);
    // Multiplayer authority mirrors it on floor advance, deduped per relic.
    expect(network).toContain('function spawnPartyBlackItemFloorBosses(state, emitEvent)');
    expect(network).toContain('spawnPartyBlackItemFloorBosses(state, emitEvent);');
  });

  test('campaign pickup hooks spawn every black boss and Heart echoes every second shot', () => {
    const combat = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
    const enemies = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
    const world = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
    const authority = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    expect(enemies).toContain("bug_card: 'ent_of_pestilence'");
    expect(enemies).toContain("dino_tooth: 't_rex'");
    expect(enemies).toContain("heart_of_the_ocean: 'sea_snake'");
    expect(combat).toContain("Neo.spawnBlackItemBoss?.(itemKey)");
    expect(combat).toContain('Neo.tryAwakenBlackBugAllies?.(enemy, dealt)');
    expect(enemies).toContain('getBugCardHeavyHitThreshold');
    expect(enemies).toContain("fireBug: Neo.nextRandom?.('encounter') < 0.05");
    expect(ALLY_SPRITE_KEY).toBe('cult_follower');
    expect(enemies).toContain('reconcileGuaranteedItemAllies');
    expect(world).toContain('Neo.player.heartOceanProjectileCount >= requiredProjectiles');
    expect(world).toContain('heartOceanEcho: true');
    expect(authority).toContain('tryAwakenAuthorityBlackBugAllies(state, playerAttacker, enemy, dealt, emitEvent)');
    expect(authority).toContain('reconcileGuaranteedItemAllies(state, player');
    expect(authority).toContain('player.heartOceanProjectileCount >= requiredProjectiles');
    expect(authority).toContain("applyAuthorityStatus(state, enemy, 'fire', 1, 3.5, owner.id)");
  });
});
