const fs = require('node:fs');
const path = require('node:path');

const {
  CAMPAIGN_HERO_STAT_BASES,
  BUILT_IN_HERO_COMBAT_PROFILES,
} = require('../js/simulation/SharedCombatContent');
const { PLAYABLE_ENEMY_ROSTER } = require('../js/simulation/SharedEnemyContent');
const { MOVE_BASE_STATS } = require('../js/simulation/SharedMoveContent');
const { FIXED_DELTA_SECONDS } = require('../js/simulation/GameSimulation');
const {
  createCampaignSimulation,
  createCampaignPlayer,
} = require('../js/simulation/CampaignSimulation');
const {
  HERO_BASE_STATS,
  applyCampaignHeroProfile,
  readMoveChargeState,
} = require('../js/simulation/NetworkCombatSystem');
const { MESSAGE_DEFINITIONS } = require('../js/protocol/ProtocolV1');

const COMBAT_PROFILE_FIELDS = [
  'damageMultiplier',
  'hpMultiplier',
  'moveSpeedMultiplier',
  'aoeRadiusMultiplier',
  'aoeDamageMultiplier',
  'laserCooldownMultiplier',
];

function matchBraces(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  throw new Error('Unbalanced braces');
}

function loadBrowserCharacterDefs() {
  const source = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
  const declaration = 'export const CHARACTER_DEFS =';
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`Missing ${declaration}`);
  const literal = matchBraces(source, source.indexOf('{', start));
  return new Function(
    'BUILT_IN_HERO_COMBAT_PROFILES',
    'PLAYABLE_ENEMY_CHARACTER_DEFS',
    `return ${literal};`,
  )(BUILT_IN_HERO_COMBAT_PROFILES, {});
}

function selectFields(source, fields = COMBAT_PROFILE_FIELDS) {
  return Object.fromEntries(fields.map(field => [field, source[field]]));
}

describe('built-in hero combat profile parity', () => {
  const browserCharacterDefs = loadBrowserCharacterDefs();
  const selectableBuiltIns = MESSAGE_DEFINITIONS.PLAYER_CHARACTER.fields.characterKey.enum;

  test('every network-selectable built-in derives browser and authority stats from the canonical profile', () => {
    expect(Object.keys(BUILT_IN_HERO_COMBAT_PROFILES)).toEqual(selectableBuiltIns);

    selectableBuiltIns.forEach(characterKey => {
      const canonical = BUILT_IN_HERO_COMBAT_PROFILES[characterKey];
      const browser = browserCharacterDefs[characterKey];
      const authority = HERO_BASE_STATS[characterKey];

      expect(selectFields(browser)).toEqual(canonical);
      expect(selectFields(authority)).toEqual(canonical);
      expect(authority.maxHp).toBe(Math.round(CAMPAIGN_HERO_STAT_BASES.maxHp * canonical.hpMultiplier));
      expect(authority.moveSpeed).toBe(CAMPAIGN_HERO_STAT_BASES.moveSpeed * canonical.moveSpeedMultiplier);
    });
  });

  test('explicitly retains Thorn Knight, Turtle Boy, and Metao balance values', () => {
    expect(HERO_BASE_STATS.thorn_knight.damageMultiplier).toBe(1.08);
    expect(HERO_BASE_STATS.turtle_boy).toEqual(expect.objectContaining({
      damageMultiplier: 0.8,
      hpMultiplier: 1.2,
      maxHp: 144,
    }));
    expect(HERO_BASE_STATS.metao).toEqual(expect.objectContaining({
      damageMultiplier: 0.5,
      aoeRadiusMultiplier: 1.2,
      aoeDamageMultiplier: 1.35,
      laserCooldownMultiplier: 1.2,
    }));

    const metao = { maxHp: 100, hp: 100 };
    applyCampaignHeroProfile(metao, 'metao');
    expect(metao).toEqual(expect.objectContaining({
      maxHp: 120,
      hp: 120,
      moveSpeed: 228,
      damageMultiplier: 0.5,
      aoeRadiusMultiplier: 1.2,
      aoeDamageMultiplier: 1.35,
      laserCooldownMultiplier: 1.2,
    }));
    expect(metao.itemStats).toEqual(expect.objectContaining({
      aoeRadiusMultiplier: 1.2,
      aoeDamageMultiplier: 1.35,
    }));
  });

  test('applies Metao laser cooldown tuning to the live authority recharge', () => {
    const simulation = createCampaignSimulation({
      matchId: 'hero-profile-cooldown',
      matchSeed: 'hero-profile-cooldown-seed',
      floorSeed: 'hero-profile-cooldown-floor',
      contentVersion: 'hero-profile-parity',
    });
    const player = createCampaignPlayer({
      id: 'p1',
      characterKey: 'metao',
      roomId: simulation.state.floorState.currentRoomId,
    });
    simulation.state.players.p1 = player;
    const castTick = simulation.state.tick;

    simulation.updateGame({
      p1: {
        actions: [{ action: 'ABILITY', abilityId: 'power_disks', aimDirection: 0 }],
      },
    }, FIXED_DELTA_SECONDS);

    const charge = readMoveChargeState(player, 'power_disks');
    expect(charge).toEqual(expect.objectContaining({ charges: 0, maxCharges: 1 }));
    expect(charge.timers).toHaveLength(1);
    expect(charge.timers[0] - castTick).toBe(Math.ceil(
      MOVE_BASE_STATS.power_disks.cooldown * 20
        * BUILT_IN_HERO_COMBAT_PROFILES.metao.laserCooldownMultiplier,
    ));
  });

  test('preserves health ratio on reselection, rival enumeration, and the custom-character authority gate', () => {
    const player = { maxHp: 200, hp: 50 };
    applyCampaignHeroProfile(player, 'thorn_knight');
    expect(player.hp).toBe(30);

    applyCampaignHeroProfile(player, 'turtle_boy');
    expect(player).toEqual(expect.objectContaining({ maxHp: 144, hp: 36 }));

    applyCampaignHeroProfile(player, 'custom_character');
    expect(player).toEqual(expect.objectContaining({
      characterKey: 'thorn_knight',
      maxHp: 120,
      hp: 30,
      damageMultiplier: 1.08,
    }));

    expect(Object.keys(HERO_BASE_STATS)).toEqual([
      ...selectableBuiltIns,
      ...PLAYABLE_ENEMY_ROSTER.map(profile => profile.characterKey),
    ]);
  });
});
