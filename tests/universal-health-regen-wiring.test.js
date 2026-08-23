const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('universal character health regeneration wiring', () => {
  test('updates the primary player and every local co-op player', () => {
    const world = read('js/game/world.js');
    expect(world).toContain('advanceUniversalHealthRegen?.(Neo.player, dt');
    expect(world).toContain('advanceUniversalHealthRegen?.(Neo.player2, dt)');
    expect(world).toContain('advanceUniversalHealthRegen?.(pn, dt)');
  });

  test('updates every living authoritative multiplayer player', () => {
    const network = read('js/simulation/NetworkCombatSystem.js');
    expect(network).toContain('const universalRegen = advanceUniversalHealthRegen(player, fixedDelta);');
    expect(network).toContain("source: 'universal_regen'");
  });
});
