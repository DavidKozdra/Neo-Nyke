const fs = require('node:fs');
const path = require('node:path');

const input = fs.readFileSync(path.join(__dirname, '../js/ui/input.js'), 'utf8');
const player = fs.readFileSync(path.join(__dirname, '../js/game/player.js'), 'utf8');
const combat = fs.readFileSync(path.join(__dirname, '../js/game/combat.js'), 'utf8');
const world = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');

describe('Neo-Knife and Tough Bandaid descriptions', () => {
  test('description percentages match the item-stat calculation', () => {
    expect(player).toContain('const baseBleedChance = neoKnife * 0.10 + toughBandaid * 0.02');
    expect(input).toContain("description: 'Basic melee and bleed-focused melee attacks gain +10% Bleed chance per stack.'");
    expect(input).toContain('defense +0.5% and +2% Bleed chance');
  });

  test('describes the actual melee bleed-proc scope', () => {
    expect(combat).toContain("rollAndApplyStatus(enemy, 'bleed', itemStats.bleedChance, 1, 5, applyBleed)");
    expect(combat).toContain('itemBleedChance: itemStats.bleedChance || 0');
    expect(input).toContain('on basic and bleed-focused melee attacks');
  });

  test('Tough Bandaid accurately states bleed mitigation and caps', () => {
    expect(player).toContain('bleedResistance: Neo.clamp(toughBandaid * 0.1, 0, 0.8)');
    expect(player).toContain('bleedDurationDecayMultiplier: Neo.clamp(1 + toughBandaid * 0.2, 1, 3)');
    expect(world).toContain("const resistance = key === 'bleed'");
    expect(input).toContain('Bleed tick damage taken -10% per stack (max -80%)');
    expect(input).toContain('20% faster per stack (max 3× speed)');
  });
});
