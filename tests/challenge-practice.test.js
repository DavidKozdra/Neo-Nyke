const fs = require('node:fs');
const path = require('node:path');

describe('challenge testing practice variant', () => {
  const gameStateSource = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
  const worldSource = fs.readFileSync(path.join(__dirname, '../js/game/world.js'), 'utf8');
  const enemiesSource = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');

  test('builds one portal for every challenge trial', () => {
    const layoutMatch = gameStateSource.match(/const CHALLENGE_PRACTICE_LAYOUT = \[([\s\S]*?)\n  \];/);

    expect(layoutMatch).not.toBeNull();
    ['mirror', 'circuit', 'bomb', 'survival', 'runes', 'storm'].forEach(type => {
      expect(layoutMatch[1]).toContain(`type: '${type}'`);
    });
  });

  test('keeps challenge testing under practice progression rules', () => {
    expect(gameStateSource).toContain("if (Neo.practiceVariant === 'challenges')");
    expect(worldSource).toContain("Neo.gameMode !== 'practice' || Neo.practiceVariant !== 'challenges'");
  });

  test('spawns return portals after either challenge outcome', () => {
    const completion = enemiesSource.slice(
      enemiesSource.indexOf('function completeChallengeTrial'),
      enemiesSource.indexOf('function isBossType'),
    );

    expect(completion.match(/ensureChallengePracticeReturnPortal/g)).toHaveLength(2);
    expect(gameStateSource).toContain("destinationLabel: 'START'");
  });
});
