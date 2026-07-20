const fs = require('node:fs');
const path = require('node:path');

// Status rings, the overheal barrier, stun stars and the status icon row were
// inlined in drawPlayer, so only the local hero showed them. Every other player
// -- split-screen co-op partners and networked teammates -- draws through
// drawPlayerSlot and showed none of it, hiding whether an ally was burning,
// poisoned, stunned or shielded. Both paths must keep sharing one implementation.
describe('player slot status visuals', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js/draw/entities.js'),
    'utf8',
  );

  const bodyOf = name => {
    const start = source.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  }', start);
    return source.slice(start, end);
  };

  test.each([
    ['drawActorStatusRings', 'status rings'],
    ['drawActorOverhealBarrier', 'overheal barrier'],
    ['drawStunStars', 'stun stars'],
    ['drawEnemyStatusIconRow', 'status icon row'],
  ])('drawPlayerSlot draws %s (%s)', helper => {
    expect(bodyOf('drawPlayerSlot')).toContain(`${helper}(`);
  });

  test('drawPlayer uses the same shared helpers instead of its own copy', () => {
    const body = bodyOf('drawPlayer');
    expect(body).toContain('drawActorStatusRings(Neo.player)');
    expect(body).toContain('drawActorOverhealBarrier(Neo.player)');
    // The inlined ring loop and barrier rect must be gone, or the two paths can
    // drift apart again.
    expect(body).not.toContain('Neo.STATUS_KEYS.length');
    expect(body).not.toContain('strokeRect');
  });

  test('the shared helpers read the actor they are given, not the global player', () => {
    ['drawActorStatusRings', 'drawActorOverhealBarrier'].forEach(helper => {
      expect(bodyOf(helper)).not.toContain('Neo.player');
    });
  });
});
